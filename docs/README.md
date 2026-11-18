# Ink Explorer documentation

## Run and change the explorer

| Task | Guide |
| --- | --- |
| Build and run a local instance | [Quick start](../README.md#quick-start) |
| Find a file, test a change or submit a pull request | [Contributing](../CONTRIBUTING.md) |
| Follow the request and rendering flow | [Architecture](ARCHITECTURE.md) |
| Update ecosystem apps, links and summaries | [Application catalogue](ARCHITECTURE.md#application-catalogue) |
| Read HTTP endpoints, errors and WebSocket messages | [API reference](API.md) |
| Work on typography, controls or responsive layouts | [Design system](DESIGN_SYSTEM.md) |
| Configure a deployment or adapt the explorer to another chain | [Configuration and forking](FORKING.md) |

## Verify and maintain

Use the test protocol for the acceptance criteria and browser, node and network requirements. Read the security policy before reporting a vulnerability and the release checklist before preparing a public snapshot. [Test protocol](TEST_PROTOCOL.md) · [Security policy](../SECURITY.md) · [Public release checklist](OPEN_SOURCE_RELEASE.md)

## Historical records

Dated reports record the exact build and scope of earlier work. They provide context for maintenance decisions and describe the environment at the recorded date.

Archive names such as `ink-explorer-…-YYYYMMDD` identify the checkout used for a measurement. References inside them, including `reports/`, are relative to that checkout. Operators retain those reports separately from the public source.

- Delivery history includes the [9 November delivery](DELIVERY_2026-11-09.md) and [17 November review](FINAL_2026-11-17.md).
- UI and explorer reviews include [the explorer audit](EXPLORER_AUDIT.md), [feature parity](EXPLORER_PARITY.md), [mobile review](MOBILE_REVIEW.md) and [the October redesign](REDESIGN_2026-10-17.md).
- Rendering and data-flow investigations include [page arrival](PAGE_ARRIVAL_2026-10-23.md), [detail arrival](DETAIL_ARRIVAL_2026-10-23.md), [ledger arrival](LEDGER_ARRIVAL_2026-10-23.md), [network arrival](NETWORK_ARRIVAL_2026-10-23.md), [startup recovery](STARTUP_RECOVERY_2026-10-23.md), [stream-first loading](STREAM_FIRST_2026-10-23.md) and [transaction following](TRANSACTION_FOLLOW_2026-10-23.md).
- Hosting records include [the live migration](MIGRATION_LIVE_2026-10-29.md), [the Cloudflare deployment notes](CLOUDFLARE_DEPLOYMENT.md), [the server migration](SERVER_MIGRATION_2026-10-27.md) and [the public API budget](RECAP_2026-10-30_publicapi.md).
- Earlier project notes include [the 23 October history](NEXT_STEPS_2026-10-23_HISTORY.md), [the notes before catalogues](NEXT_STEPS_2026-10-28_pre_catalogues.md) and [the 29 October recap](RECAP_2026-10-29.md).
