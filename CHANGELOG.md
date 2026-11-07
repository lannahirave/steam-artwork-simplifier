# Changelog

This lists user-visible changes to Steam Artwork Studio, newest first. Version numbers and dates come from the project history; versions with only internal changes are not listed.

## [1.2.34] - 2026-11-07

### Added
- A **Changelog** button in the header opens this list of changes, newest first, with your version marked. A blue dot next to it shows until you have seen the latest changes.

### Changed
- Workshop thumbnails in Library cards are stacked in rows (2 or 3 rows) the way Steam shows them.

## [1.2.33] - 2026-11-06

### Added
- Add an optional note to any conversion in the Library tab. Notes are passed on to the SteamCanvas profile preview, where you can use them to find a conversion.

## [1.2.32] - 2026-11-05

### Added
- New **Background** setting with Auto, Transparent and Black. Auto keeps transparency only when the source has it (PNG, GIF, WebP, and WebM with alpha), Transparent also makes letterbox bars see-through, and Black flattens transparent sources onto black.
- Results with transparency are shown on a checkerboard. The Guide preset notes that Steam may not keep transparency in guide images.

## [1.2.31] - 2026-11-04

### Added
- The Library tab has a **Saved in SteamCanvas** section that lists, opens and deletes the demo page examples SteamCanvas has saved.

## [1.2.30] - 2026-11-04

### Changed
- The first-run tour waits until you add a clip, then opens **Edit source** and explains crop, trim (videos only) and Apply, Reset and Cancel, before covering Library, Patch Tools, Steam Helpers and Guides. Done moves focus to **Run Conversion**.

### Fixed
- In the Edit source dialog, the video no longer overlaps the controls on short screens. The dialog scrolls instead.

## [1.2.28] - 2026-11-03

### Added
- Optional **Height** (leave empty for automatic, up to 2000 px) and **Fit** (crop to fill or letterbox) for Workshop, Artwork Showcase and Featured. The Cut Preview shows the result. The Guide preset stays 195x195.

## [1.2.27] - 2026-11-03

### Changed
- Buttons share one consistent style across the app.
- **Reset Results** is disabled while a conversion runs or when there is nothing to clear, with a tooltip that explains why.

## [1.2.26] - 2026-11-03

### Added
- A **Use sample clip** button on the source field loads a short bundled clip, so you can try the app without your own video. The tour follows the clip into the cut preview.

### Changed
- **Edit source** uses the primary button style.

### Fixed
- Pressing Escape inside the source editor no longer closes the tour.

## [1.2.25] - 2026-11-03

### Changed
- Cleaner first screen: the duplicate version chip and per-tab labels are gone, the guide link uses an icon instead of an emoji, the tour dims the page more in the dark theme, and the browser processing note is in plainer language in all languages.

## [1.2.24] - 2026-11-03

### Fixed
- Primary buttons stay readable on hover in the light theme.
- Tour buttons are large enough to tap on touch screens.
- The file picker on phones no longer cuts off the status text.

## [1.2.23] - 2026-11-02

### Fixed
- The tour card takes keyboard focus when it opens and returns it when closed, step changes are announced to screen readers, and Escape in the phone menu returns focus to the menu button. Navigation and tour labels are translated.

## [1.2.22] - 2026-11-02

### Changed
- The first-run tour has 4 steps that follow the job (preset, source file, profile preview, upload) and highlight the real controls. It stays on the Convert tab.
- At 980 px wide and below, the tabs and header settings move into a menu, so the header no longer pushes the page wider than a phone screen.
- The browser warning has a new look with better contrast, and the Copy Diagnostics button is gone.

### Fixed
- The tour highlight is no longer at least about 256 px wide regardless of the target.

## [1.2.21] - 2026-11-02

### Changed
- Less empty space between the overview band and the workspace.

## [1.2.20] - 2026-11-01

### Added
- The Library tab shows how much space it uses and has a size limit, 500 MB by default (change it from 250 MB to 5 GB). When a new conversion goes over the limit, the oldest conversions are deleted and the Convert tab says how many. Lowering the limit asks first.
- A "Saved to your local Library" message with a link to the Library tab appears right after a conversion finishes.

### Changed
- Library thumbnails show the whole GIF in its own proportions instead of cropping Workshop slices.
- The profile preview hint is now only a tooltip, and the "Saved to the Library" line is gone. Save failures are still shown.
- The page description, link previews and search information now mention the Library and the SteamCanvas profile preview.

### Fixed
- JPEG images no longer crash the conversion, and a crash in the video engine no longer leaves a conversion hanging. The engine is reset before the next request.
- Firefox and Safari logs no longer show a "heap unavailable" tag.

## [1.2.19] - 2026-11-01

### Changed
- The target size for Workshop and Artwork Showcase GIFs is raised from 4500 KB to 4800 KB.

## [1.2.18] - 2026-11-01

### Changed
- The tab card section below the overview is removed. The header links are the tab navigation, and below 980 px wide they become a scrollable row.

## [1.2.17] - 2026-11-01

### Added
- **Library**: every conversion is saved automatically in this browser. The new Library tab lets you review, re-download, preview on your Steam profile, delete one item or delete everything.
- SteamCanvas can list and open saved conversions from the Library.

## [1.2.13] - 2026-10-31

### Changed
- The Steam profile preview now opens on previewartwork.lannahirave.com.

## [1.2.12] - 2026-10-31

### Added
- **Preview on my Steam profile** button for Workshop, Artwork Showcase and Featured results. It opens the SteamCanvas profile preview with your GIFs already placed.

## [1.2.11] - 2026-10-31

### Added
- Steam Helpers has a batch upload script that uploads many files in order to the Workshop, Artwork or Featured showcase, or the Screenshot showcase. It has App ID, visibility and delay settings with defaults by type and validation, and explains the console "allow pasting" step. Available in all five languages.

## [1.2.10] - 2026-10-30

### Fixed
- The trim slider starts at the beginning of the track and follows playback smoothly.

## [1.2.9] - 2026-10-29

### Changed
- The app moves from the Netlify site to its own domain, artworkstudio.lannahirave.com, hosted on Cloudflare. Page links, link previews, sitemap and `robots.txt` point to the new address.
- Stricter security headers, and the video engine files are checked against a known checksum before they run.

## [1.2.8] - 2026-10-29

### Added
- The Cut Preview shows the real output size. Click it to open an editor with a draggable crop box, aspect presets, numeric fields and, for videos, a trim range. The conversion uses the edited video.

## [1.2.7] - 2026-10-29

### Changed
- PNG, JPG and WEBP sources now produce an output in the same format, resized and cropped to the preset, instead of a single-frame GIF. BMP becomes PNG. Still GIFs keep the GIF path.

### Fixed
- JPEG images are no longer treated as animated.

## [1.2.5] - 2026-10-29

### Changed
- Anonymous conversion counts are now stored on Cloudflare instead of Netlify. Only per-day totals are kept, and IP addresses are not stored.

### Removed
- The old Python command-line tool and its notes are removed. The browser app replaces them.

## [1.2.4] - 2026-10-24

### Changed
- **Darken shadows** is set to Medium by default.

## [1.2.3] - 2026-10-17

### Added
- **Darken shadows** option removes noise in dark areas of the source.

## [1.2.2] - 2026-10-17

### Changed
- The hero button "Explore workflow" is replaced by a link to the Steam guide.

## [1.2.1] - 2026-10-17

### Changed
- Guide and Featured results are shown at their real output size.

## [1.2.0] - 2026-10-17

### Added
- **Cut Preview** shows how the current preset slices your source before you convert.

### Changed
- The logo is a red hollow square again.

## [1.1.96] - 2026-10-17

### Fixed
- Switching back from Artwork Showcase to Workshop restores the Workshop parts and width defaults.

## [1.1.95] - 2026-10-17

### Changed
- Result cards line up caption, image, details and download rows across slices.

## [1.1.94] - 2026-10-17

### Changed
- The theme follows your system setting by default, and the toggle is a sun and moon icon.

## [1.1.93] - 2026-10-17

### Added
- Dark theme, switched from the header and remembered between visits.

## [1.1.92] - 2026-10-17

### Changed
- New black link preview image with a red hollow square.

## [1.1.91] - 2026-10-17

### Added
- Link previews (Open Graph and Twitter), a sitemap, `robots.txt` and `llms.txt`, so search engines and chat assistants describe the app correctly.

## [1.1.90] - 2026-10-17

### Changed
- The browser tab icon is the app's logo instead of the default Vite icon, and the page has search description tags.

## [1.1.89] - 2026-10-14

### Added
- After a conversion finishes, a small prompt in the corner links to the Steam guide for leaving feedback. It appears once per browser session, only when files were produced, and does not cover the first-run tour.

## [1.1.87] - 2026-10-07

### Added
- Aggregate-only conversion counts, so the number of conversions can be tracked without identifying anyone.

## [1.1.86] - 2026-10-07

### Changed
- The Workshop preset field takes a full row, with the number fields below it.

## [1.1.85] - 2026-10-07

### Added
- Simplified Chinese in the language selector.

## [1.1.84] - 2026-10-07

### Added
- Spanish in the language selector.

## [1.1.83] - 2026-10-07

### Changed
- The preset row has a longer preset field and shorter number fields.

## [1.1.82] - 2026-07-18

### Changed
- **Optimization mode** moves to the basic settings.

## [1.1.81] - 2026-07-18

### Changed
- The worker setting is limited to three workers in the interface.

## [1.1.80] - 2026-07-17

### Fixed
- When quality recovery keeps looking for a better result, the latest accepted outputs are kept.

## [1.1.79] - 2026-07-17

### Changed
- A simpler first-run workflow in the Convert tab.

## [1.1.78] - 2026-07-04

### Changed
- The browser tab icon is a red square instead of the default Vite icon.

## [1.1.76] - 2026-06-24

### Changed
- Android browsers are flagged as unsupported in the browser warning.

## [1.1.75] - 2026-06-23

### Fixed
- Language links such as `/uk` and `/cs` work when opened directly on the hosted site.

## [1.1.74] - 2026-06-23

### Changed
- The third-party notices label is translated.

## [1.1.73] - 2026-06-23

### Changed
- Steam Helpers notes are translated.

## [1.1.72] - 2026-06-23

### Changed
- All remaining interface text is translated into Ukrainian and Czech.

## [1.1.70] - 2026-06-23

### Added
- Each language has its own address, so a link opens the app in that language.

## [1.1.69] - 2026-06-23

### Added
- Ukrainian and Czech translations, with a language selector.

## [1.1.66] - 2026-06-22

### Added
- Browser support check: the Convert tab warns when your browser cannot run the converter.

## [1.1.65] - 2026-06-22

### Fixed
- Finishing a conversion early keeps the outputs that were already completed.

## [1.1.64] - 2026-06-21

### Added
- **Finish** a conversion early instead of waiting for every quality-recovery pass.

## [1.1.61] - 2026-06-20

### Fixed
- Memory used by decoded frames is released after a conversion.

## [1.1.59] - 2026-06-17

### Fixed
- Decoded frames are not kept in memory longer than needed during a conversion.

## [1.1.57] - 2026-06-16

### Added
- Conversion logs show memory use (heap) in browsers that report it.

## [1.1.56] - 2026-06-16

### Changed
- Clearer memory warning, and a new order of the Raw mode option in the Convert form.

## [1.1.55] - 2026-06-16

### Changed
- Workshop rows default to one.

## [1.1.54] - 2026-06-16

### Changed
- Reordered fields in the Convert form.

## [1.1.53] - 2026-06-16

### Fixed
- The Convert form layout on narrow screens.

## [1.1.52] - 2026-06-15

### Added
- Advisory notes in the Convert tab that warn about sources likely to cause problems.

## [1.1.51] - 2026-06-13

### Added
- Workshop multi-row splitting: split one source across several rows of Workshop artwork.

## [1.1.50] - 2026-06-12

### Changed
- A tighter search for the best quality that fits the size limit when recovering split GIFs.

## [1.1.49] - 2026-06-12

### Changed
- Conversion logs say which worker produced each line.

## [1.1.48] - 2026-06-12

### Changed
- Quality recovery reuses already decoded frames between passes, which speeds it up.

## [1.1.47] - 2026-06-12

### Changed
- Quality recovery tries several settings in parallel waves.

## [1.1.46] - 2026-06-12

### Changed
- Split quality recovery runs in parallel.

## [1.1.45] - 2026-06-12

### Changed
- Retries after a failed size check reuse the extracted GIF frames.

## [1.1.44] - 2026-06-12

### Changed
- Split quality recovery uses a binary search to find the best setting faster.

## [1.1.43] - 2026-06-11

### Added
- Timestamps in conversion logs.

## [1.1.42] - 2026-06-11

### Changed
- Faster encoding during split quality recovery.

## [1.1.41] - 2026-06-11

### Changed
- Split quality recovery does less repeated work.

## [1.1.40] - 2026-06-11

### Changed
- The gifski quality setting is used throughout the whole conversion flow.

## [1.1.39] - 2026-06-11

### Fixed
- More reliable split quality recovery.

## [1.1.38] - 2026-06-11

### Changed
- Improved colour recovery for split GIFs.

## [1.1.37] - 2026-06-11

### Added
- Split quality recovery: when some slices of a split GIF come out worse than the rest, the whole batch is re-encoded to bring quality back.

## [1.1.36] - 2026-06-08

### Fixed
- Reopening the first-run tour starts it from the first step.

## [1.1.35] - 2026-06-08

### Changed
- The first-run tour scrolls so the highlighted panel starts near the top of the screen.

## [1.1.34] - 2026-06-08

### Changed
- Larger font in the top navigation.

## [1.1.33] - 2026-06-08

### Removed
- Decorative overview cards.

## [1.1.32] - 2026-06-08

### Changed
- Output patching options use switches.

## [1.1.31] - 2026-06-08

### Changed
- Checkbox controls are redesigned as switches.
- Captions in the split GIF preview are kept within their cards.

## [1.1.30] - 2026-06-08

### Fixed
- Controls in the compact split preview wrap instead of overflowing.

## [1.1.29] - 2026-06-08

### Changed
- Tighter layout for the split GIF preview.

## [1.1.28] - 2026-06-07

### Added
- Hybrid GIF optimization mode.

## [1.1.27] - 2026-06-07

### Fixed
- Conversion logs no longer repeat lines.

## [1.1.26] - 2026-06-07

### Changed
- Clearer hover and active states in the top navigation.

## [1.1.22] - 2026-06-07

### Fixed
- The first-run tour highlight is no longer clipped.

## [1.1.21] - 2026-06-07

### Fixed
- The colour reduction message is shown correctly.

## [1.1.19] - 2026-06-06

### Added
- First-run onboarding tour and an interface that can be translated.

## [1.1.10] - 2026-04-15

### Fixed
- The Convert button scrolls to the right place.

## [1.1.9] - 2026-04-15

### Changed
- Redesigned layout inspired by Apple's web design.

## [1.1.8] - 2026-03-17

### Added
- A Guide upload section with a link to Steam's guide upload page.

## [1.1.7] - 2026-03-17

### Fixed
- The Workshop upload link points to the correct Steam page.

## [1.1.6] - 2026-03-05

### Fixed
- Better tab contrast and clearer tab buttons.

## [1.1.5] - 2026-03-05

### Changed
- A more practical studio layout.

## [1.1.4] - 2026-03-05

### Changed
- Redesigned Steam Artwork Studio interface.

## [1.1.3] - 2026-03-05

### Added
- In-app legal notices and the license files shipped with the app. The project is now licensed under AGPL-3.0-or-later.

## [1.1.2] - 2026-03-05

### Added
- Copy buttons for conversion logs.

## [1.1.1] - 2026-03-05

### Fixed
- GIFs loop forever again.

## [1.1.0] - 2026-03-05

### Changed
- GIFs are encoded with gifski for better quality at the same size.

## [1.0.3] - 2026-03-04

### Added
- In-app Steam trademark disclaimer.

## [1.0.1] - 2026-03-04

### Changed
- Updated Artwork Showcase labels and a better Steam guide section.
- Better dark mode contrast, and Steam upload addresses are links.

## [1.0.0] - 2026-03-04

### Added
- First stable release of the browser app, hosted on Netlify.

### Changed
- Output files and the downloaded zip are named after the source file.
- Improved Artwork Showcase and Workshop conversion flow, including handling of videos with a dark intro.
- The Guide preset has a 2000 KB limit.

### Fixed
- GIFs that are over the size limit stay visible in the results.

## [0.9.1] - 2026-03-03

### Added
- Workshop conversion that picks one shared FPS for all parts using a two-pass flow, with an FPS estimator and runtime timing.
- Guide preset at a fixed 195x195, a Guides tab, and a Raw mode toggle with grouped convert settings and lossy optimization controls.
- Image and WebP sources, GIF input, and more detail about each GIF.
- The app version is shown in the header.

## [0.0.0] - 2026-03-02

### Added
- A first browser prototype that converts videos to GIFs with FFmpeg in WebAssembly.
- Before it, a command-line tool (Python) made GIFs for Steam with a maximum size target, parallel encoding, optional NVIDIA decoding and lossy optimization, along with a script that fills in the Steam upload page.
