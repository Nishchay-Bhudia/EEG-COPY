# Consolidated image: builds the Vue SPA and bakes it into the .NET app's
# wwwroot, so one container serves both the API and the UI.
# NOTE: build context is the REPO ROOT (see render.yaml dockerContext: .).

# ── SPA build stage ──
FROM node:20-alpine AS spa
WORKDIR /spa
COPY eeg-ui/web/package*.json ./
RUN npm ci
COPY eeg-ui/web/ ./
# Same-origin .NET mode: routes at root, bearer tokens (see lib/api.js).
RUN printf 'VITE_API_BASE=\n' > .env.production && npm run build   # → /spa/dist

# ── .NET build stage ──
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY eeg-backend/Directory.Build.props ./
COPY eeg-backend/NeuroYogic.sln ./
COPY eeg-backend/src/NeuroYogic.Domain/*.csproj src/NeuroYogic.Domain/
COPY eeg-backend/src/NeuroYogic.SignalProcessing/*.csproj src/NeuroYogic.SignalProcessing/
COPY eeg-backend/src/NeuroYogic.Analysis/*.csproj src/NeuroYogic.Analysis/
COPY eeg-backend/src/NeuroYogic.Infrastructure/*.csproj src/NeuroYogic.Infrastructure/
COPY eeg-backend/src/NeuroYogic.Api/*.csproj src/NeuroYogic.Api/
RUN dotnet restore src/NeuroYogic.Api/NeuroYogic.Api.csproj
COPY eeg-backend/src/ src/
RUN dotnet publish src/NeuroYogic.Api/NeuroYogic.Api.csproj -c Release -o /app --no-restore

# ── Runtime stage ──
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
COPY --from=build /app ./
COPY --from=spa /spa/dist ./wwwroot

# Non-root user
RUN adduser --disabled-password --gecos "" appuser && chown -R appuser /app
USER appuser

ENV ASPNETCORE_URLS=http://0.0.0.0:8080
ENV ASPNETCORE_ENVIRONMENT=Production
EXPOSE 8080

ENTRYPOINT ["dotnet", "NeuroYogic.Api.dll"]
