#!/usr/bin/env python3
"""Exercise installed, agent-created TEST helpers with synthetic input only.

The TEST workflows output a URL; they cannot open it or post any financial entry.
"""
import argparse
import json
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import unquote, urlsplit

CASES = [
    ('purchase', 'Card purchase HKD 12.34 at TEST STORE card ending 9999', True),
    ('chinese', '信用卡簽賬 HK$1,234.56，商戶：合成測試，尾號 9999', True),
    ('foreign', 'Transaction USD 9.99 at SYNTHETIC STORE', True),
    ('repayment', 'Card repayment HKD 500 received', True),
    ('escaping', 'Purchase HKD 12.34 at "TEST" \\ shop\nline two & #? <img onerror="alert(1)"> 💳', True),
    ('otp', 'OTP 123456 purchase HKD 12.34', False),
    ('verification', 'Verification code 123456 for payment HKD 12.34', False),
    ('password', 'Your password 123456 for purchase HKD 12.34', False),
    ('chinese-code', '交易 HKD 12.34 一次性密碼 123456', False),
    ('login', 'Sign-in payment HKD 12.34', False),
    ('promotion', 'New offer: reward HKD 500', False),
    ('no-amount', 'Your card purchase completed', False),
    ('empty', '', False),
    ('oversized', 'Purchase HKD 1 ' + 'x' * 4001, False),
]


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--bank', action='append', choices=['hsbc', 'hangseng'])
    args = p.parse_args()
    results = []
    with tempfile.TemporaryDirectory(prefix='myfin-bank-native-') as folder:
        folder = Path(folder)
        for bank in args.bank or ['hsbc', 'hangseng']:
            label = 'HSBC' if bank == 'hsbc' else 'Hang Seng'
            for case, notice, accepted in CASES:
                inp, out = folder / 'notice.txt', folder / 'result.txt'
                inp.write_text(notice)
                out.unlink(missing_ok=True)
                run = subprocess.run(['shortcuts', 'run', f'Myfin {label} Capture TEST Verified',
                                      '--input-path', str(inp), '--output-path', str(out)],
                                     text=True, capture_output=True, timeout=30)
                assert run.returncode == 0, (bank, case, run.stderr)
                result = out.read_text() if out.exists() else ''
                if accepted:
                    url = urlsplit(result)
                    assert (url.scheme, url.netloc, url.path, url.query) == (
                        'https', 'tommyyy-glitch.github.io', '/Myfin/', '')
                    assert url.fragment.startswith('bank-capture=')
                    data = json.loads(unquote(url.fragment[len('bank-capture='):]))
                    assert data == {'bank': bank, 'text': notice}, (bank, case, data)
                else:
                    assert '#bank-capture=' not in result, (bank, case)
                results.append({'bank': bank, 'case': case, 'passed': True})
    print(json.dumps({'nativeRuntime': 'Apple Shortcuts', 'cases': results}, indent=2))


if __name__ == '__main__':
    main()
