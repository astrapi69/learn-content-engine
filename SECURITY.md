# Security policy

## Supported versions

Only the **latest minor release line** on npm receives security fixes. Older
minors are not patched; update to the latest release to stay supported.

## Reporting a vulnerability

Please report vulnerabilities **privately** via GitHub security advisories:

<https://github.com/astrapi69/learn-content-engine/security/advisories/new>

Do **not** open a public issue for a security problem. You will get an
acknowledgement in the advisory thread, and a fix ships as a patch release on
the latest minor.

Scope note: the engine runs no network, storage, or UI code, but it does parse
untrusted YAML/JSON input (`parseManifest`, `parseLesson`, the CLI). Parsing or
validation behavior that can be abused by crafted content is in scope.
