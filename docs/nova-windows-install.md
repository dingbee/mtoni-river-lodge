# NOVA Hospitality — Restaurant & Bar OS
# Installing the local runtime on a clean Windows machine

Scope: repository → running appliance on one Windows PC, with Android tablets
trading against it over the LAN. No product logic is changed by this runbook.

## 0. How Windows is supported

The appliance runtime is POSIX: the scripts are `bash`, and they call `psql`,
`pg_isready`, `postgrest`, `openssl`, `ss`, `chmod` and `hostname -I`. The
supported Windows path is therefore **WSL2 (Ubuntu 22.04+)** — a first-class,
Microsoft-supported Linux kernel on Windows, not an emulator. The pre-flight
already accepts `windows` as a platform. Native Win32 services (no WSL) would
require rewriting the installer, service supervision and TLS tooling; that is
out of scope here and is not required to run the product.

Host requirements: 64-bit x86_64/arm64, **4 GB RAM minimum** (8 GB recommended),
**20 GB free disk**, wired or stable Wi-Fi on the same LAN as the tablets.

## 1. Files involved (all already in the repository)

| File | Role |
| --- | --- |
| `local/.env.example` | configuration template (copy to `local/.env`) |
| `local/scripts/install.sh` | the installer: pre-flight → state decision → secrets → DB → migrations → UI bundle → start → readiness → first-run URL |
| `local/scripts/preflight.sh` | host facts → `src/modules/runtime/local/preflight.ts` |
| `local/scripts/init-db.sh`, `local/scripts/apply-migrations.sh` | database creation and checksum-verified migrations |
| `local/sql/pre/*.sql`, `local/sql/post/*.sql` | roles, extensions, auth shim, PostgREST compatibility, `nova_local` schema |
| `local/scripts/gen-keys.sh` | ES256 JWT signing keypair |
| `local/scripts/gen-tls.sh` | per-installation CA + appliance certificate |
| `local/scripts/build-ui.sh`, `local/scripts/stamp-ui.sh` | local UI build and origin binding |
| `local/config/postgrest.conf.template` | PostgREST configuration |
| `local/gateway/server.ts`, `local/gateway/app.ts` | the only LAN-exposed process: auth, data proxy, application UI |
| `local/scripts/start.sh`, `stop.sh`, `novactl.sh` | lifecycle control |
| `local/scripts/backup.sh`, `restore.sh`, `diagnostics.sh` | operations |

## 2. Windows prerequisites (PowerShell as Administrator)

```powershell
wsl --install -d Ubuntu-22.04
wsl --set-default-version 2
wsl --update
```
Reboot when prompted, then open **Ubuntu** and create the Linux user.

On Windows 11 22H2 or newer, put WSL on the LAN directly — this removes all
port-forwarding work. Create `C:\Users\<you>\.wslconfig`:

```ini
[wsl2]
networkingMode=mirrored
firewall=true
```
Then, in PowerShell: `wsl --shutdown` and reopen Ubuntu.

## 3. Runtime prerequisites (inside Ubuntu/WSL)

```bash
sudo apt update
sudo apt install -y postgresql-17 postgresql-contrib-17 openssl curl unzip jq
# If 17 is unavailable on your release:
#   sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
#   curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo gpg --dearmor -o /usr/share/keyrings/pgdg.gpg
#   sudo apt update && sudo apt install -y postgresql-17

# PostgREST
curl -fsSL -o /tmp/postgrest.tar.xz \
  https://github.com/PostgREST/postgrest/releases/download/v12.2.3/postgrest-v12.2.3-linux-static-x64.tar.xz
sudo tar -xJf /tmp/postgrest.tar.xz -C /usr/local/bin postgrest
sudo chmod +x /usr/local/bin/postgrest

# Bun (gateway + build)
curl -fsSL https://bun.sh/install | bash
echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.bashrc && source ~/.bashrc

sudo service postgresql start
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';"
postgrest --version && bun --version && psql --version
```

## 4. Get the code and configure

```bash
cd ~ && git clone <your-repository-url> nova && cd nova
bun install
cp local/.env.example local/.env
chmod 600 local/.env
```

Edit `local/.env` — only these lines need attention; the installer generates the
rest (authenticator password, JWT keys, TLS) and never ships secrets:

```ini
NOVA_DB_HOST=127.0.0.1
NOVA_DB_PORT=5432
NOVA_DB_SUPERUSER=nova_superuser
NOVA_DB_SUPERUSER_PASSWORD=<choose a strong password>
NOVA_GATEWAY_HOST=0.0.0.0
NOVA_GATEWAY_PORT=8000
NOVA_RUNTIME_MODE=local
```

## 5. Find the LAN IP the tablets will dial

```powershell
# Windows PowerShell
(Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.InterfaceAlias -notmatch 'Loopback|vEthernet' }).IPAddress
```
Give that machine a DHCP reservation or static lease on the router — the
certificate and the tablet home-screen icons are bound to this address.

## 6. Install

```bash
cd ~/nova
export NOVA_TLS_IPS="127.0.0.1 <LAN-IP-from-step-5>"   # cert must cover the dialled address
bash local/scripts/preflight.sh          # inspect first (optional)
bash local/scripts/install.sh --dry-run  # decides, changes nothing (optional)
bash local/scripts/install.sh
```

The installer refuses to touch an existing installation; use `--upgrade` or
`--repair` for a machine that already has one. On success it prints the install
id and the first-run URL. First run takes several minutes because it builds the
application UI (`build-ui.sh`); `NOVA_BUILD_UI=off` skips the build if you ship
a prebuilt `dist/`.

## 7. Expose the appliance to the LAN

**Mirrored networking (step 2)** — nothing to forward. Just open the firewall:

```powershell
New-NetFirewallRule -DisplayName "NOVA Gateway HTTPS" -Direction Inbound -Protocol TCP -LocalPort 8443 -Action Allow
New-NetFirewallRule -DisplayName "NOVA Gateway HTTP"  -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow
```

**NAT networking (older Windows)** — forward both ports into WSL, then open the
firewall as above:

```powershell
$wsl = (wsl hostname -I).Trim().Split(" ")[0]
netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=8443 connectaddress=$wsl connectport=8443
netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=8000 connectaddress=$wsl connectport=8000
netsh interface portproxy show all
```
The WSL IP changes on reboot under NAT — re-run those two lines after each
restart (or use mirrored mode, which has no such problem).

## 8. Verify on the appliance

```bash
bash local/scripts/novactl.sh status     # database / data-service / gateway / application
bash local/scripts/novactl.sh ready      # SYSTEM READY or the failing component
bash local/scripts/novactl.sh version
curl -sk https://127.0.0.1:8443/health | jq
```
`ready` must print `SYSTEM READY` before you touch a tablet.

## 9. First-run URL

Open on the appliance or any LAN browser:

```
https://<LAN-IP>:8443/
```

`/` sends terminals to the operations entry point; first-run bootstrap creates
the property, currency, timezone, outlets and the first administrator. Property
configuration lives in the database — never in `local/.env`.

## 10. Android tablet connection

1. **Trust the appliance CA.** Copy `local/keys/tls/nova-local-ca.crt` to the
   tablet (USB, or serve it once over the LAN). On the tablet:
   *Settings → Security → Encryption & credentials → Install a certificate →
   CA certificate → Install anyway →* pick `nova-local-ca.crt`.
   Never bypass certificate warnings instead of installing the CA.
2. Join the tablet to the **same Wi-Fi/VLAN** as the appliance; the AP must not
   have client isolation enabled.
3. Open Chrome → `https://<LAN-IP>:8443/` → sign in.
4. **Install the terminal:** Chrome menu → *Add to Home screen / Install app*.
   Scope `/admin`, start URL `/admin/restaurant/pos`.
5. Launch from the home-screen icon. Restaurant POS is
   `/admin/restaurant/pos`, Bar POS `/admin/restaurant/bar/pos`.

Tablet installability and touch ergonomics remain **NOT physically certified** —
see the Productization-4E section of `docs/productization-4-installer-android.md`.

## 11. Day-to-day operation

```bash
bash local/scripts/novactl.sh start|stop|restart|status|ready|health|version
bash local/scripts/novactl.sh backup            # checksum-verified artefact
bash local/scripts/novactl.sh restore <file>    # confirmed, refuses while trading
bash local/scripts/novactl.sh diagnostics       # redacted support bundle
bash local/scripts/novactl.sh tls --force       # re-issue the certificate
```

Start automatically at logon — Task Scheduler, *At log on*, run:

```
C:\Windows\System32\wsl.exe -d Ubuntu-22.04 -- bash -lc "sudo service postgresql start && cd ~/nova && bash local/scripts/novactl.sh start"
```

## 12. Troubleshooting

| Symptom | Cause / action |
| --- | --- |
| Tablet: `ERR_CONNECTION_REFUSED` | firewall rule or portproxy missing (step 7); under NAT the WSL IP changed |
| Tablet: certificate warning | CA not installed, or the LAN IP is not in the certificate — re-run step 6 `NOVA_TLS_IPS` then `novactl.sh tls --force` |
| `SYSTEM NOT READY` | `novactl.sh ready` names the failing component; `local/run/*.log` has detail |
| `application UI unavailable` | no bundle — `bash local/scripts/build-ui.sh` then `novactl.sh restart` |
| PostgreSQL not running after reboot | `sudo service postgresql start` (WSL has no systemd by default) |
| Installer aborts | an installation already exists; `--upgrade` or `--repair`, never a fresh install |
