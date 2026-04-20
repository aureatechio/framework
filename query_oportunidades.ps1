$headers = @{
  'apikey' = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF3cXR6b2VmdXRuZm1uYm9tdWp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzkyMTYyMTUsImV4cCI6MjA1NDc5MjIxNX0.JMdboXzu7NMTXH8NuKdxzNO3SYOOag4kuQL_SSO0PEY'
  'Authorization' = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF3cXR6b2VmdXRuZm1uYm9tdWp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzkyMTYyMTUsImV4cCI6MjA1NDc5MjIxNX0.JMdboXzu7NMTXH8NuKdxzNO3SYOOag4kuQL_SSO0PEY'
}

$url = 'https://awqtzoefutnfmnbomujt.supabase.co/rest/v1/loogsLeads?select=lead&etapa_posterior=eq.a6709949-9857-4b25-965d-b4bf8270426b&lead=not.is.null&created_at=gte.2026-02-01T00:00:00&created_at=lte.2026-02-28T23:59:59&limit=10000'
$r = Invoke-WebRequest -Uri $url -Headers $headers -UseBasicParsing
$data = $r.Content | ConvertFrom-Json
$distinct = ($data | ForEach-Object { $_.lead } | Sort-Object -Unique)
Write-Output "Leads DISTINTOS que passaram por Oportunidade (Fev/2026): $($distinct.Count)"
Write-Output "Total de linhas na loogsLeads: $($data.Count)"
