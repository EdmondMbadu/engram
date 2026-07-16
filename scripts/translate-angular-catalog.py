#!/usr/bin/env python3
"""Translate Angular's generated JSON catalog with an installed Argos model.

Angular placeholders are translated segment-by-segment so their spelling and
ordering remain valid for the compile-time localizer. Product names and URLs
are deliberately preserved.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from argostranslate import translate


WORKSPACE = Path(__file__).resolve().parent.parent
SOURCE_PATH = WORKSPACE / "src/locale/messages.json"
PLACEHOLDER = re.compile(r"(\{\$[^}]+\}|\{[A-Za-z][A-Za-z0-9_]*\})")
PROTECTED = re.compile(r"(\s[|·]\s|LivingWiki|Living Wiki|Mind Palace|Philly|https?://\S+)", re.IGNORECASE)
LETTER = re.compile(r"[A-Za-z]")
TARGETS = {
    "fr": ("fr", WORKSPACE / "src/locale/messages.fr.json"),
    "ja": ("ja", WORKSPACE / "src/locale/messages.ja.json"),
}
MANUAL_OVERRIDES = {
    "fr": {
        "Public LivingWiki Pages": "Pages LivingWiki publiques",
        "Public LivingWiki pages": "Pages LivingWiki publiques",
        "City LivingWiki pages": "Pages LivingWiki des villes",
        "Find what lights you up.": "Trouvez ce qui vous passionne.",
        "LivingWiki.com is like having a friend who knows everything about your city.": "LivingWiki.com, c’est comme avoir un ami qui sait tout sur votre ville.",
        "What is the LivingWiki platform?": "Qu’est-ce que la plateforme LivingWiki ?",
        "Watch the 60-second intro": "Regardez la présentation de 60 secondes",
        "Search cities, neighborhoods, topics, and upcoming LivingWiki pages...": "Recherchez des villes, des quartiers, des sujets et les prochaines pages LivingWiki…",
        "Sign In": "Se connecter",
        "Cities": "Villes",
        "Others": "Autres",
        "Upgrade": "Mettre à niveau",
        "Light mode": "Mode clair",
        "Dark mode": "Mode sombre",
        "Change language": "Changer de langue",
        "Languages": "Langues",
        "Access your LivingWiki": "Accédez à votre LivingWiki",
        "Continue with Google": "Continuer avec Google",
        "Working...": "Traitement…",
        "Signing In...": "Connexion…",
        "Create Account": "Créer un compte",
        "Creating Account...": "Création du compte…",
        "Public Wikis | LivingWiki": "Wikis publics | LivingWiki",
        "For Business | LivingWiki": "Pour les entreprises | LivingWiki",
        " Be found where your{$LINE_BREAK} city is {$START_TAG_SPAN}already looking.{$CLOSE_TAG_SPAN}": " Soyez visible là où votre{$LINE_BREAK} ville est {$START_TAG_SPAN}déjà en train de chercher.{$CLOSE_TAG_SPAN}",
    },
    "ja": {
        "Public LivingWiki Pages": "公開 LivingWiki ページ",
        "Public LivingWiki pages": "公開 LivingWiki ページ",
        "City LivingWiki pages": "都市の LivingWiki ページ",
        "Find what lights you up.": "あなたの心が動くものを見つけよう。",
        "LivingWiki.com is like having a friend who knows everything about your city.": "LivingWiki.com は、あなたの街を何でも知っている友人のような存在です。",
        "What is the LivingWiki platform?": "LivingWiki プラットフォームとは？",
        "Watch the 60-second intro": "60秒の紹介を見る",
        "Search cities, neighborhoods, topics, and upcoming LivingWiki pages...": "都市、地域、トピック、公開予定の LivingWiki ページを検索…",
        "Sign In": "ログイン",
        "Cities": "都市",
        "Others": "その他",
        "Upgrade": "アップグレード",
        "Light mode": "ライトモード",
        "Dark mode": "ダークモード",
        "Change language": "言語を変更",
        "Languages": "言語",
        "Access your LivingWiki": "LivingWiki にアクセス",
        "Continue with Google": "Google で続行",
        "Working...": "処理中…",
        "Signing In...": "ログイン中…",
        "Create Account": "アカウントを作成",
        "Creating Account...": "アカウントを作成中…",
        "Public Wikis | LivingWiki": "公開 Wiki | LivingWiki",
        "For Business | LivingWiki": "ビジネス向け | LivingWiki",
        " Be found where your{$LINE_BREAK} city is {$START_TAG_SPAN}already looking.{$CLOSE_TAG_SPAN}": " あなたの街が{$LINE_BREAK} すでに探している場所で{$START_TAG_SPAN}見つけてもらおう。{$CLOSE_TAG_SPAN}",
    },
}


def translate_piece(piece: str, target: str, cache: dict[str, str]) -> str:
    if not LETTER.search(piece):
        return piece

    leading = piece[: len(piece) - len(piece.lstrip())]
    trailing = piece[len(piece.rstrip()) :]
    core = piece.strip()
    if not core:
        return piece

    protected_parts = PROTECTED.split(core)
    translated_parts: list[str] = []
    for part in protected_parts:
        if not part:
            continue
        if PROTECTED.fullmatch(part):
            translated_parts.append(part)
            continue
        if not LETTER.search(part):
            translated_parts.append(part)
            continue
        part_leading = part[: len(part) - len(part.lstrip())]
        part_trailing = part[len(part.rstrip()) :]
        part_core = part.strip()
        if part_core not in cache:
            cache[part_core] = translate.translate(part_core, "en", target)
        translated_parts.append(f"{part_leading}{cache[part_core]}{part_trailing}")
    return f"{leading}{''.join(translated_parts)}{trailing}"


def translate_message(message: str, target: str, cache: dict[str, str]) -> str:
    return "".join(
        part if PLACEHOLDER.fullmatch(part) else translate_piece(part, target, cache)
        for part in PLACEHOLDER.split(message)
    )


def placeholders(message: str) -> list[str]:
    return PLACEHOLDER.findall(message)


def manual_override(message: str, target: str) -> str | None:
    exact = MANUAL_OVERRIDES[target].get(message)
    if exact is not None:
        return exact
    leading = message[: len(message) - len(message.lstrip())]
    trailing = message[len(message.rstrip()) :]
    translated = MANUAL_OVERRIDES[target].get(message.strip())
    return None if translated is None else f"{leading}{translated}{trailing}"


def main() -> None:
    if len(sys.argv) != 2 or sys.argv[1] not in TARGETS:
        raise SystemExit("usage: translate-angular-catalog.py <fr|ja>")

    target = sys.argv[1]
    locale, output_path = TARGETS[target]
    source = json.loads(SOURCE_PATH.read_text())
    source_messages: dict[str, str] = source["translations"]
    cache_path = Path(f"/tmp/livingwiki-translation-cache-{target}.json")
    cache = json.loads(cache_path.read_text()) if cache_path.exists() else {}
    translated: dict[str, str] = {}

    for index, (message_id, message) in enumerate(source_messages.items(), start=1):
        target_message = manual_override(message, target) or translate_message(message, target, cache)
        if placeholders(target_message) != placeholders(message):
            raise RuntimeError(f"Placeholder mismatch for {message_id}: {message!r} -> {target_message!r}")
        translated[message_id] = target_message
        if index % 100 == 0:
            cache_path.write_text(json.dumps(cache, ensure_ascii=False))
            print(f"{target}: translated {index}/{len(source_messages)} messages", flush=True)

    output_path.write_text(
        json.dumps({"locale": locale, "translations": translated}, ensure_ascii=False, indent=2) + "\n"
    )
    cache_path.write_text(json.dumps(cache, ensure_ascii=False))
    print(f"{target}: wrote {len(translated)} messages to {output_path}", flush=True)


if __name__ == "__main__":
    main()
