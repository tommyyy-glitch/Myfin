#!/usr/bin/env python3
"""Build portable Myfin bank-capture helpers; sign with Apple's shortcuts CLI.

These helpers accept explicitly supplied notification Body text. Native bank
notification triggers must be connected on the iPhone; this script never edits
the user's Shortcuts database or invents device-specific app-picker tokens.
"""
import argparse
import plistlib
import uuid
from pathlib import Path

BASE_URL = 'https://tommyyy-glitch.github.io/Myfin/#bank-capture='
SECURITY_WORDS = (
    r'\bOTP\b|one[\s-]*time|verification|security[\s-]*code|authentication|'
    r'passcode|password|驗證|認證碼|一次性|密碼|登入|登錄|sign[\s-]*in|log[\s-]*in'
)
AMOUNT = r'(?:HK\$|HKD|US\$|USD|JPY|CNY|RMB)\s*[0-9][0-9,]*(?:\.[0-9]{1,2})?'
TRANSACTION_WORDS = (
    r'purchase|spent|charged|paid|payment|transaction|debited|credited|received|'
    r'withdrawal|repayment|消費|簽賬|簽帳|扣賬|扣帳|支出|存入|入賬|入帳|付款|'
    r'支付|交易|提款|還款|還卡數'
)
# ICU (Shortcuts Match Text): require the whole, bounded notice to match.
NOTICE_PATTERN = (
    r'(?is)\A(?=.{1,4000}\z)(?!.*(?:' + SECURITY_WORDS + r'))'
    r'(?=.*(?:' + AMOUNT + r'))(?=.*(?:' + TRANSACTION_WORDS + r')).*\z'
)


def token(value):
    return {'Value': value, 'WFSerializationType': 'WFTextTokenAttachment'}


def text(value, attachment=None, prefix=''):
    if attachment is None:
        return {'Value': {'string': value}, 'WFSerializationType': 'WFTextTokenString'}
    offset = len(prefix.encode('utf-16-le')) // 2
    return {
        'Value': {'string': prefix + '\ufffc',
                  'attachmentsByRange': {f'{{{offset}, 1}}': attachment}},
        'WFSerializationType': 'WFTextTokenString',
    }


def build(bank, *, test=False, notification=False):
    if bank not in ('hsbc', 'hangseng'):
        raise ValueError('Unsupported bank')
    label = 'HSBC' if bank == 'hsbc' else 'Hang Seng'
    name = f'Myfin {label} Capture' + (' TEST Verified' if test else '')
    if notification:
        name = 'Myfin HSBC Ready' if bank == 'hsbc' else 'Myfin Hang Seng'
    ids = {key: str(uuid.uuid4()).upper() for key in
           ('body', 'match', 'if', 'dictionary', 'json', 'encoded', 'url')}

    def out(key, output_name):
        return {'Type': 'ActionOutput', 'OutputUUID': ids[key], 'OutputName': output_name}

    def action(identifier, **params):
        return {'WFWorkflowActionIdentifier': 'is.workflow.actions.' + identifier,
                'WFWorkflowActionParameters': params}

    dictionary = {'WFSerializationType': 'WFDictionaryFieldValue', 'Value': {
        'WFDictionaryFieldValueItems': [
            {'WFItemType': 0, 'WFKey': text('bank'), 'WFValue': text(bank)},
            {'WFItemType': 0, 'WFKey': text('text'),
             'WFValue': text('', out('match', 'Matches'))},
        ]}}
    actions = [
        action('comment', WFCommentActionText=(
            'Myfin bank notification capture. Input must be the selected bank notification Body. '
            'Security/sign-in notices and unrecognised formats stop locally. '
            'Only Myfin receives matching notice text, in a URL fragment. '
            'Myfin opens a review form and never saves or posts automatically. '
            'No clipboard, files, bank login, account balance or credentials are read.')),
        action('detect.text', WFInput=token({
            'Type': 'TriggerOutput', 'TriggerIdentifier': 'WFNotificationTrigger',
            'Aggrandizements': [{'Type': 'WFPropertyVariableAggrandizement', 'PropertyName': 'Body'}],
        } if notification else {'Type': 'ExtensionInput'}), UUID=ids['body']),
        action('text.match', text=text('', out('body', 'Text')),
               WFMatchTextPattern=NOTICE_PATTERN, WFMatchTextCaseSensitive=False,
               UUID=ids['match']),
        action('conditional', GroupingIdentifier=ids['if'], WFControlFlowMode=0,
               WFCondition=100,
               WFInput={'Type': 'Variable', 'Variable': token(out('match', 'Matches'))}),
        action('dictionary', WFItems=dictionary, UUID=ids['dictionary']),
        action('detect.text', WFInput=token(out('dictionary', 'Dictionary')), UUID=ids['json']),
        action('urlencode', WFEncodeMode='Encode', WFInput=text('', out('json', 'Text')),
               UUID=ids['encoded']),
        action('gettext', WFTextActionText=text('', out('encoded', 'URL Encoded Text'), BASE_URL),
               UUID=ids['url']),
    ]
    if test:
        actions.append(action('output', WFOutput=text('', out('url', 'Text')),
                              WFNoOutputSurfaceBehavior='Do Nothing'))
    else:
        actions.append(action('openurl', WFInput=text('', out('url', 'Text'))))
    actions.append(action('conditional', GroupingIdentifier=ids['if'], WFControlFlowMode=2))
    return {
        'WFWorkflowName': name,
        'WFWorkflowClientVersion': '5037.111' if notification else '4033.0.4.3',
        'WFWorkflowMinimumClientVersion': 900,
        'WFWorkflowMinimumClientVersionString': '900',
        'WFWorkflowIcon': {'WFWorkflowIconGlyphNumber': 61440,
                           'WFWorkflowIconStartColor': 4282601983 if bank == 'hsbc' else 4292093695},
        'WFWorkflowActions': actions,
        'WFWorkflowInputContentItemClasses': ['WFStringContentItem'],
        'WFWorkflowOutputContentItemClasses': ['WFStringContentItem'],
        'WFWorkflowHasShortcutInputVariables': True,
        'WFWorkflowHasOutputFallback': False,
        'WFWorkflowTypes': ['WFWorkflowTypeShowInSearch'] if notification else ['ActionExtension'],
        'WFQuickActionSurfaces': [],
        'WFWorkflowImportQuestions': [],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', type=Path, default=Path('shortcuts'))
    parser.add_argument('--include-tests', action='store_true')
    parser.add_argument('--notification-input', action='store_true')
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    for bank in ('hsbc', 'hangseng'):
        for test in ((False, True) if args.include_tests else (False,)):
            workflow = build(bank, test=test, notification=args.notification_input)
            target = args.output_dir / (workflow['WFWorkflowName'] + '.unsigned.wflow')
            target.write_bytes(plistlib.dumps(workflow, fmt=plistlib.FMT_BINARY, sort_keys=False))
            print(target)


if __name__ == '__main__':
    main()
