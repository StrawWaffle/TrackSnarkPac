"""Read superchats and gifted memberships out of a downloaded chat replay."""
import json


def _text(node):
    node = node or {}
    if "simpleText" in node:
        return node["simpleText"]
    return "".join(run.get("text", "") for run in node.get("runs", []))


def parse_replay(path):
    """Returns (superchats, gifts):
    superchats: [author, author_id, amount as shown, offset s, message, sticker label]
    gifts:      [author, author_id, memberships gifted, offset s]"""
    superchats, gifts = [], []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            replay = obj.get("replayChatItemAction", {})
            offset = int(replay.get("videoOffsetTimeMsec") or 0) // 1000
            for action in replay.get("actions", []):
                item = action.get("addChatItemAction", {}).get("item", {})
                r = item.get("liveChatPaidMessageRenderer") or item.get("liveChatPaidStickerRenderer")
                if r:
                    sticker = (r.get("sticker") or {}).get("accessibility", {}).get("accessibilityData", {}).get("label", "")
                    superchats.append([_text(r.get("authorName")) or "unknown", r.get("authorExternalChannelId", ""),
                                       _text(r.get("purchaseAmountText")), offset, _text(r.get("message")), sticker])
                elif "liveChatSponsorshipsGiftPurchaseAnnouncementRenderer" in item:
                    r = item["liveChatSponsorshipsGiftPurchaseAnnouncementRenderer"]
                    header = (r.get("header") or {}).get("liveChatSponsorshipsHeaderRenderer", {})
                    digits = "".join(ch if ch.isdigit() else " " for ch in _text(header.get("primaryText"))).split()
                    gifts.append([_text(header.get("authorName")) or "unknown", r.get("authorExternalChannelId", ""),
                                  int(digits[0]) if digits else 1, offset])
    return superchats, gifts
