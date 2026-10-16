# Deploying to Azure

One-time setup for whoever deploys the site. After this, every push to `main` on GitHub
tests the code and deploys it automatically.

## What gets created

| Resource | Purpose | Approx. cost / month |
|---|---|---|
| App Service plan (Linux, B1) + Web App | Runs the .NET API **and** the React site | ~$13 |
| Azure SQL Database (Basic, 2 GB) | All data; automatic backups with 7-day point-in-time restore | ~$5 |
| Storage account + `menu-images` container | Menu photos (public read) | < $1 |
| Application Insights + Log Analytics | Errors, slow pages, uptime data | free allowance usually enough |

## 1. Create the resources

Install the [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli), then:

```bash
az login
az group create --name rg-burchips --location uaenorth   # or centralindia

az deployment group create \
  --resource-group rg-burchips \
  --template-file infra/main.bicep \
  --parameters infra/main.parameters.json \
  --parameters ownerEmail='owner@yourdomain.pk' \
               ownerPassword='<temporary owner password, 10+ chars>' \
               sqlAdminPassword='<strong SQL password>' \
               otpSecret="$(openssl rand -hex 32)"
```

The output shows `webAppName` and `url`. Open the URL: the database is created and the menu is
loaded automatically on first start. Sign in at `/admin` with the owner email and temporary password,
then **change the password** (bottom-left → Change password).

> Secrets are passed as parameters and stored as App Service settings. For extra protection later,
> move them to Azure Key Vault references and switch the database to a managed identity.

## 2. Connect GitHub for automatic deploys

1. Push this repository to GitHub.
2. In the Azure portal → the Web App → **Download publish profile**.
3. In GitHub → repository **Settings → Secrets and variables → Actions**:
   - Secret `AZURE_WEBAPP_PUBLISH_PROFILE` = contents of the downloaded file
   - Variable `AZURE_WEBAPP_NAME` = the `webAppName` output
4. Push to `main` (or run the workflow manually). The pipeline lints, runs all tests, builds and deploys,
   then checks `/api/health`.

## 3. Your domain (e.g. burchips.pk)

Web App → **Custom domains → Add custom domain**, follow the DNS instructions (CNAME or A + TXT record
at your domain provider), then add a **free App Service managed certificate** for HTTPS.
Link previews, the sitemap and robots.txt pick up the new domain automatically.

## 4. Settings to fill in when accounts are ready

Web App → **Settings → Environment variables** (restart afterwards):

| Setting | When |
|---|---|
| `Sms__Provider` + provider keys | SMS company account ready — needed for customer sign-in codes |
| `WhatsApp__PhoneNumberId`, `WhatsApp__AccessToken`, `WhatsApp__RecipientPhone` (e.g. `923441858989`) | Meta WhatsApp Business set up and `new_order_alert` template approved |
| `Turnstile__SiteKey`, `Turnstile__SecretKey` | Free Cloudflare Turnstile widget created for your domain |

`Seed__OwnerEmail` / `Seed__OwnerPassword` are only used on the very first start; you can delete them afterwards.

## Backups and restore

Azure SQL keeps automatic backups. To restore: SQL database → **Restore** → pick a time in the last 7 days
(this creates a copy; point the connection string at it once checked).

## Monitoring

- Application Insights → **Failures** shows errors; **Availability** can ping `/api/health` every 5 minutes and email you if the site is down.
- App Service → **Health check** is already pointed at `/api/health`.
