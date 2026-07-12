using Microsoft.Extensions.DependencyInjection;
using NeuroYogic.Analysis.Classification;
using NeuroYogic.SignalProcessing;

namespace NeuroYogic.Analysis;

public static class DependencyInjection
{
    /// <summary>Registers the DSP + classification pipeline (all stateless singletons).</summary>
    public static IServiceCollection AddEegAnalysis(this IServiceCollection services)
    {
        services.AddSingleton<IFeatureExtractor>(_ => new FeatureExtractor());
        services.AddSingleton<IYogaClassifier, YogaClassifier>();
        services.AddSingleton<IGunaClassifier, GunaClassifier>();
        services.AddSingleton<IVedanticAnalyzer, VedanticAnalyzer>();
        services.AddSingleton<IEegAnalysisService, EegAnalysisService>();
        return services;
    }
}
