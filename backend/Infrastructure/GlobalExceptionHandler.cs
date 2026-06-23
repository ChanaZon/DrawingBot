using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;

namespace backend.Infrastructure;

// Safety net for UNEXPECTED exceptions only (bugs, infrastructure failures).
// Expected/domain failures are returned as Result + DrawParseError and mapped to
// HTTP in the controller — they never reach here. This handler logs the fault and
// returns a generic RFC 7807 ProblemDetails so no stack trace leaks to clients.
public class GlobalExceptionHandler : IExceptionHandler
{
    private readonly ILogger<GlobalExceptionHandler> _logger;

    public GlobalExceptionHandler(ILogger<GlobalExceptionHandler> logger)
    {
        _logger = logger;
    }

    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        _logger.LogError(exception,
            "Unhandled exception for {Method} {Path}",
            httpContext.Request.Method, httpContext.Request.Path);

        var problem = new ProblemDetails
        {
            Status = StatusCodes.Status500InternalServerError,
            Title = "An unexpected error occurred.",
            Type = "https://datatracker.ietf.org/doc/html/rfc7807",
        };

        httpContext.Response.StatusCode = problem.Status.Value;
        await httpContext.Response.WriteAsJsonAsync(problem, cancellationToken);

        return true; // handled — stop the pipeline from rethrowing
    }
}
