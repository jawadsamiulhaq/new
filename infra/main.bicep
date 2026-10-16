// BurChips × Bake Dukan — Azure infrastructure.
// Creates: App Service (Linux, B1) running the .NET 10 app + React site, Azure SQL (Basic),
// Blob Storage for menu photos, and Application Insights for monitoring.
//
// Deploy (see infra/README.md):
//   az group create -n rg-burchips -l uaenorth
//   az deployment group create -g rg-burchips -f infra/main.bicep -p infra/main.parameters.json

@description('Short name used in resource names (lowercase letters/numbers).')
@minLength(3)
@maxLength(12)
param appName string = 'burchips'

@description('Azure region. UAE North or Central India are closest to Lahore.')
param location string = resourceGroup().location

@description('SQL Server administrator login.')
param sqlAdminLogin string = 'burchipsadmin'

@secure()
@description('SQL Server administrator password (12+ chars, mixed case, numbers, symbols).')
param sqlAdminPassword string

@secure()
@description('Random secret (32+ characters) used to protect phone login codes.')
param otpSecret string

@description('Email for the first owner account (created on first start only).')
param ownerEmail string

@secure()
@description('Temporary password for the first owner account — change it after first sign-in.')
param ownerPassword string

@description('App Service plan size. B1 is enough to start; scale up from the portal as orders grow.')
param appServiceSku string = 'B1'

var suffix = uniqueString(resourceGroup().id)
var webAppName = '${appName}-${suffix}'
var imageContainer = 'menu-images'

// ---------- Monitoring ----------

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${appName}-logs-${suffix}'
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource insights 'Microsoft.Insights/components@2020-02-02' = {
  name: '${appName}-insights-${suffix}'
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logs.id
  }
}

// ---------- Menu photos ----------

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: take('${appName}img${suffix}', 24)
  location: location
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    allowBlobPublicAccess: true // menu photos are public images
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

resource images 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: imageContainer
  properties: { publicAccess: 'Blob' }
}

// ---------- Database ----------

resource sqlServer 'Microsoft.Sql/servers@2023-08-01-preview' = {
  name: '${appName}-sql-${suffix}'
  location: location
  properties: {
    administratorLogin: sqlAdminLogin
    administratorLoginPassword: sqlAdminPassword
    minimalTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
  }
}

// Lets the App Service reach the database (Azure-internal traffic only).
resource allowAzure 'Microsoft.Sql/servers/firewallRules@2023-08-01-preview' = {
  parent: sqlServer
  name: 'AllowAzureServices'
  properties: { startIpAddress: '0.0.0.0', endIpAddress: '0.0.0.0' }
}

resource database 'Microsoft.Sql/servers/databases@2023-08-01-preview' = {
  parent: sqlServer
  name: 'burchips'
  location: location
  sku: { name: 'Basic', tier: 'Basic' } // 2 GB, automatic backups with 7-day point-in-time restore
}

// ---------- Web app ----------

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: '${appName}-plan-${suffix}'
  location: location
  kind: 'linux'
  sku: { name: appServiceSku }
  properties: { reserved: true }
}

var sqlConnection = 'Server=tcp:${sqlServer.properties.fullyQualifiedDomainName},1433;Database=${database.name};User ID=${sqlAdminLogin};Password=${sqlAdminPassword};Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;'
var storageConnection = 'DefaultEndpointsProtocol=https;AccountName=${storage.name};AccountKey=${storage.listKeys().keys[0].value};EndpointSuffix=${environment().suffixes.storage}'

resource web 'Microsoft.Web/sites@2023-12-01' = {
  name: webAppName
  location: location
  kind: 'app,linux'
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'DOTNETCORE|10.0'
      alwaysOn: true // keeps the order-alert worker and live connections running
      webSocketsEnabled: true // live orders and order tracking
      http20Enabled: true
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      healthCheckPath: '/api/health'
      appSettings: [
        { name: 'ASPNETCORE_ENVIRONMENT', value: 'Production' }
        // Azure terminates HTTPS in front of the app; trust its X-Forwarded-* headers.
        { name: 'ASPNETCORE_FORWARDEDHEADERS_ENABLED', value: 'true' }
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: insights.properties.ConnectionString }
        { name: 'Database__MigrateOnStartup', value: 'true' }
        { name: 'Otp__Secret', value: otpSecret }
        { name: 'Seed__OwnerEmail', value: ownerEmail }
        { name: 'Seed__OwnerPassword', value: ownerPassword }
        { name: 'Images__Provider', value: 'AzureBlob' }
        { name: 'Images__BlobConnectionString', value: storageConnection }
        { name: 'Images__BlobContainer', value: imageContainer }
        { name: 'Images__PublicBaseUrl', value: '${storage.properties.primaryEndpoints.blob}${imageContainer}' }
        // Fill these in from the portal when the accounts are ready (see LAUNCH-CHECKLIST.md):
        { name: 'Sms__Provider', value: '' }
        { name: 'WhatsApp__PhoneNumberId', value: '' }
        { name: 'WhatsApp__AccessToken', value: '' }
        { name: 'WhatsApp__RecipientPhone', value: '' }
        { name: 'Turnstile__SiteKey', value: '' }
        { name: 'Turnstile__SecretKey', value: '' }
      ]
      connectionStrings: [
        { name: 'Default', connectionString: sqlConnection, type: 'SQLAzure' }
      ]
    }
  }
}

// Allows GitHub Actions to deploy with the app's publish profile.
resource scmPublishing 'Microsoft.Web/sites/basicPublishingCredentialsPolicies@2023-12-01' = {
  parent: web
  name: 'scm'
  properties: { allow: true }
}

output webAppName string = web.name
output url string = 'https://${web.properties.defaultHostName}'
output imageBaseUrl string = '${storage.properties.primaryEndpoints.blob}${imageContainer}'
