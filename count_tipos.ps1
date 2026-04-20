$h = @{
  apikey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF3cXR6b2VmdXRuZm1uYm9tdWp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzkyMTYyMTUsImV4cCI6MjA1NDc5MjIxNX0.JMdboXzu7NMTXH8NuKdxzNO3SYOOag4kuQL_SSO0PEY'
  Authorization = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF3cXR6b2VmdXRuZm1uYm9tdWp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzkyMTYyMTUsImV4cCI6MjA1NDc5MjIxNX0.JMdboXzu7NMTXH8NuKdxzNO3SYOOag4kuQL_SSO0PEY'
  Prefer = 'count=exact'
}
$base = 'https://awqtzoefutnfmnbomujt.supabase.co/rest/v1/agendamento'

$r1 = Invoke-WebRequest -Uri "$base`?tipo_agendamento=eq.0dd89dff-b808-4224-aed9-1017bdc4cf1c&select=id&limit=0" -Headers $h
Write-Host "Meet Google: $($r1.Headers['Content-Range'])"

$r2 = Invoke-WebRequest -Uri "$base`?tipo_agendamento=eq.a23a700b-673e-4e7f-afed-8f0eb56c1455&select=id&limit=0" -Headers $h
Write-Host "Ligacao: $($r2.Headers['Content-Range'])"

$r3 = Invoke-WebRequest -Uri "$base`?tipo_agendamento=is.null&select=id&limit=0" -Headers $h
Write-Host "NULL: $($r3.Headers['Content-Range'])"

$r4 = Invoke-WebRequest -Uri "$base`?select=id&limit=0" -Headers $h
Write-Host "TOTAL: $($r4.Headers['Content-Range'])"
