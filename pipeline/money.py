"""Superchat amounts to US dollars.

YouTube shows amounts as text ("$5.00", "CA$2.00", "£10.00", "SEK 50.00").
Rates come from FXRatesAPI's free latest endpoint (one request, all rates
against USD); set FXRATES_API_KEY to send a key.
"""
import json
import os
import re
import time
import urllib.parse
import urllib.request

AMOUNT_RE = re.compile(r"^([^\d]*)([\d.,]+)(.*)$")
SYMBOLS = {
    "$": "USD", "US$": "USD", "CA$": "CAD", "A$": "AUD", "NZ$": "NZD", "MX$": "MXN",
    "HK$": "HKD", "NT$": "TWD", "R$": "BRL", "S$": "SGD", "£": "GBP", "€": "EUR",
    "¥": "JPY", "CN¥": "CNY", "₹": "INR", "₩": "KRW", "₱": "PHP", "₪": "ILS",
    "₫": "VND", "₺": "TRY", "₴": "UAH", "₦": "NGN", "฿": "THB", "zł": "PLN", "kr": "SEK",
}


def parse_amount(text):
    """'CA$5.00' -> (5.0, 'CAD'); (None, None) when it can't be read."""
    m = AMOUNT_RE.match((text or "").strip().replace("\xa0", ""))
    if not m:
        return None, None
    prefix, number, suffix = m.groups()
    label = (prefix.strip() or suffix.strip()).replace("\xa0", "")
    if "," in number and "." in number:
        number = number.replace(".", "").replace(",", ".") if number.rfind(",") > number.rfind(".") else number.replace(",", "")
    elif "," in number:
        tail = number.split(",")[-1]
        number = number.replace(",", ".") if number.count(",") == 1 and len(tail) == 2 else number.replace(",", "")
    try:
        amount = float(number)
    except ValueError:
        return None, None
    code = SYMBOLS.get(label) or (label if len(label) == 3 and label.isalpha() and label.isupper() else None)
    return amount, code


def fetch_rates():
    params = {"base": "USD"}
    if os.environ.get("FXRATES_API_KEY"):
        params["api_key"] = os.environ["FXRATES_API_KEY"]
    req = urllib.request.Request("https://api.fxratesapi.com/latest?" + urllib.parse.urlencode(params), headers={"User-Agent": "tracksnarkpac/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.load(r)
    if not data.get("success") or "rates" not in data:
        raise RuntimeError(f"FXRatesAPI said: {json.dumps(data)[:200]}")
    return {"date": data["date"][:10], "fetched": int(time.time()), "rates": data["rates"]}


def to_usd(text, rates):
    amount, code = parse_amount(text)
    r = rates["rates"]
    if amount is None or code not in r:
        return None
    return round(amount / r[code], 2)
