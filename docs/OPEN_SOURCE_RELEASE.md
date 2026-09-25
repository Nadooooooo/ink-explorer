# Public release checklist

This repository can be prepared while private. Keep it private until the owner chooses to publish it.

## Before the first code push

- Review the staged file list and run a secret and personal-information scan over the exact Git snapshot. Confirm `.env`, caches, node data, reports and screenshots are absent.
- Check the source and documentation for machine-specific paths, personal addresses and attribution that should not be public. Inspect image metadata as well as text.
- Confirm the Git commit author uses the intended GitHub account and its private `noreply` address. Git commits require an email field; use GitHub's private address rather than a personal one.
- Confirm the use of Ink brand assets and third-party fonts is documented in `THIRD_PARTY_NOTICES.md`; the Ink logo is not part of the code's MIT license.
- Run the checks in `CONTRIBUTING.md` that apply to the final source snapshot. Record any known limitation before publishing.

## Before changing repository visibility to public

- Review the README, quick start, license, contributor guide, issue templates, pull request template, code of conduct and security policy as a new contributor would.
- Enable GitHub private vulnerability reporting and verify the reporting entry point. Arrange a private channel for conduct reports without publishing a personal email address.
- Confirm Issues and Discussions are enabled, choose initial `good first issue` and `help wanted` tasks, and prepare to respond to first contributions.
- Review repository settings, Actions permissions and branch protection for the intended maintenance workflow.
- Check the public repository description, topics and default branch. Verify that the live site, if linked, uses a stable HTTPS URL and that its legal and attribution statements are accurate.

Publishing a GitHub repository or pushing code is a separate decision from preparing these files.
