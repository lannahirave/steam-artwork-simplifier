# Header Hex Edit Workflow (Separate Tool)

## Tool
- Script: `steam_hex_edit_header.py`
- Purpose: apply header-level GIF hex edits as a separate workflow from `steam_hex_patch.py`.

## What it edits
- GIF Logical Screen Width (bytes `6-7`, little-endian)
- GIF Logical Screen Height (bytes `8-9`, little-endian)
- Optional EOF byte patch (default `0x21`)

## Defaults (`.env`)
```env
HEX_HEADER_WIDTH=1000
HEX_HEADER_HEIGHT=1
HEX_HEADER_EOF_PATCH_ENABLED=true
HEX_HEADER_EOF_BYTE=21
HEX_HEADER_BACKUP_ENABLED=true
HEX_HEADER_EXTENSIONS=.gif
```

## Command examples
```bash
# Dry run on one file
python steam_hex_edit_header.py .\media\art3\output\featured.gif --dry-run

# Patch one file with .env defaults
python steam_hex_edit_header.py .\media\art3\output\featured.gif

# Patch all gifs in a folder (recursive)
python steam_hex_edit_header.py .\media\art3\output --recursive

# Override width/height and EOF byte
python steam_hex_edit_header.py .\media\art3\output\featured.gif --width 1000 --height 1 --byte 21

# Disable EOF patch (header dims only)
python steam_hex_edit_header.py .\media\art3\output\featured.gif --no-eof-patch
```

## Notes
- The script creates `.hex.bak` backups by default.
- Use `--no-backup` if you do not want backup files.
