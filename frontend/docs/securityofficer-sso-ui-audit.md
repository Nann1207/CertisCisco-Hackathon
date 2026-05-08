# Security Officer and SSO UI Audit

Pre-change audit for `frontend/app/securityofficer` and `frontend/app/sso`, excluding SOP screens (`sop.tsx` and SOP category pages).

## Header Anomalies

- Home uses a strong white header typography style (`20px`, heavy weights) and consistent `44px` top / `16px` horizontal spacing, but many child pages use one-off values.
- Dark incident-style headers commonly used `paddingHorizontal: 11-12`, `paddingTop: 40`, and `paddingBottom: 6-14`, so the title and back/action buttons did not line up with home.
- Page title font sizes vary widely: `16`, `18`, `22`, `24`, `30`, and modal/page titles up to `35-40`.
- Page title weights vary from `600` to `900`; several dark headers were noticeably lighter than home.
- Some titles are centered by default, some are left/flex aligned, and long titles such as `Harassment & Whistleblowing` have smaller custom sizes.
- A few pages (`upcoming-shift-details`, `schedule`) use dynamic title sizes, while most headers are fixed.

## Layout Anomalies

- Several page containers use fixed horizontal padding (`12`, `18`, `22`) without tablet max-width constraints.
- Incident pages use rounded body panels, while utility pages use flat white/gray pages. That can stay, but header spacing should still match.
- Some content areas are already scroll based and safe for small phones; others rely on fixed card heights or modal heights.

## Request Backup Modal Anomalies

- `currentIncident.tsx` request backup modal count buttons used `justifyContent: "flex-start"`, causing the grid to sit left instead of centered.
- Count tiles used fixed widths/heights (`30%`, `minWidth: 87`, `height: 113`) which can crowd small phones and look undersized on larger phones/iPad.
- The modal card had fixed `maxWidth` and `minHeight` values without using available screen dimensions for the count controls.

## Planned Normalization

- Standardize non-SOP page header title styling to match home's stronger font feel: `fontSize: 20`, `lineHeight: 24`, `fontWeight: "800"`.
- Standardize non-SOP header spacing around back/action buttons: `paddingTop: 44`, `paddingHorizontal: 16`, and `paddingBottom: 12`.
- Keep page-specific color/background choices, but align the title font and spacing.
- Center the backup count buttons and make tile sizing responsive from screen width.
