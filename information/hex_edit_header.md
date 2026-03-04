# Header Hex Edit Workflow (Legacy Tool)

Checked on March 4, 2026.

Tool:

- Script: `steam_hex_edit_header.py`
- Purpose: patch GIF logical width/height header bytes, optional EOF patch.

## What it edits

- Width: bytes `6-7` (little-endian)
- Height: bytes `8-9` (little-endian)
- Optional EOF byte patch (default `0x21`)

## Example

```bash
python steam_hex_edit_header.py .\media\my_folder --recursive
```

## Notes

- Backups can be created with `.hex.bak` depending on options/env.
- For current browser workflow, use web app Patch Tools tab first.
