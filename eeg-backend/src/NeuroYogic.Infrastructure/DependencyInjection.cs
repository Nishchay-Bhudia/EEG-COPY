using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using NeuroYogic.Infrastructure.Identity;
using NeuroYogic.Infrastructure.Persistence;
using NeuroYogic.Infrastructure.Services;

namespace NeuroYogic.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration config)
    {
        // ── Persistence ──
        var provider = config.GetValue<string>("Database:Provider") ?? "Sqlite";
        var connectionString = config.GetConnectionString("Default")
                               ?? "Data Source=neuroyogic.db";

        services.AddDbContext<NeuroYogicDbContext>(options =>
        {
            if (provider.Equals("Postgres", StringComparison.OrdinalIgnoreCase))
                options.UseNpgsql(connectionString);
            else
                options.UseSqlite(connectionString);
        });

        // ── Identity / auth ──
        services.Configure<JwtOptions>(config.GetSection(JwtOptions.SectionName));
        services.AddSingleton(TimeProvider.System);
        services.AddSingleton<IPasswordHasher, BcryptPasswordHasher>();
        services.AddScoped<IJwtTokenService, JwtTokenService>();
        services.AddScoped<IAuthService, AuthService>();

        // ── Application services ──
        services.AddScoped<ISessionService, SessionService>();
        services.AddScoped<IWatchTokenService, WatchTokenService>();
        services.AddScoped<IActivityService, ActivityService>();
        services.AddScoped<IClientService, ClientService>();
        services.AddScoped<IUserService, UserService>();
        services.AddScoped<ILiveService, LiveService>();

        return services;
    }
}
