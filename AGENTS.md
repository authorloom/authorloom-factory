<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This repository includes a modern Next.js runtime surface. Inspect the installed package version and local docs before changing framework-sensitive code.
<!-- END:nextjs-agent-rules -->

# Authorloom Factory Quick Rules

- Read `AGENT.md` before editing.
- Feature work targets `development`; production hotfixes target `main`.
- Do not deploy production unless explicitly asked.
- Never casually change secrets, buckets, or Cloud Run environment variables.
- FFmpeg graph changes must preserve Layout Studio timing, placement, duration, and layer order.
- PNG/still-image handling must preserve source dimensions and placement.
- Diagnose FFmpeg/job payload issues before changing queue behavior.
