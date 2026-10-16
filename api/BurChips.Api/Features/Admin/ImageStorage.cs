using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;

namespace BurChips.Api.Features.Admin;

public class ImageOptions
{
    public const string Section = "Images";

    /// <summary>"Local" (development) or "AzureBlob" (production).</summary>
    public string Provider { get; set; } = "Local";

    /// <summary>Folder for Local storage, relative to the app's content root.</summary>
    public string LocalPath { get; set; } = "App_Data/uploads";

    public string BlobConnectionString { get; set; } = "";
    public string BlobContainer { get; set; } = "menu-images";

    /// <summary>Optional public base URL (e.g. a CDN) in front of the blob container.</summary>
    public string? PublicBaseUrl { get; set; }

    public const int MaxBytes = 3 * 1024 * 1024;
}

public interface IImageStorage
{
    /// <returns>The public URL of the stored image.</returns>
    Task<string> SaveAsync(byte[] content, ImageKind kind, CancellationToken ct);
    Task DeleteAsync(string url, CancellationToken ct);
}

public enum ImageKind { Jpeg, Png, WebP }

public static class ImageValidator
{
    /// <summary>Identifies the image by its first bytes — the file name and declared type are not trusted.</summary>
    public static ImageKind? Detect(ReadOnlySpan<byte> data)
    {
        if (data.Length >= 3 && data[0] == 0xFF && data[1] == 0xD8 && data[2] == 0xFF) return ImageKind.Jpeg;
        if (data.Length >= 8 && data[..8].SequenceEqual(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A })) return ImageKind.Png;
        if (data.Length >= 12 && data[..4].SequenceEqual("RIFF"u8) && data[8..12].SequenceEqual("WEBP"u8)) return ImageKind.WebP;
        return null;
    }

    public static string Extension(ImageKind kind) => kind switch
    {
        ImageKind.Jpeg => ".jpg",
        ImageKind.Png => ".png",
        _ => ".webp",
    };

    public static string ContentType(ImageKind kind) => kind switch
    {
        ImageKind.Jpeg => "image/jpeg",
        ImageKind.Png => "image/png",
        _ => "image/webp",
    };
}

/// <summary>Development: stores images on disk, served at /uploads.</summary>
public class LocalImageStorage(IWebHostEnvironment env, Microsoft.Extensions.Options.IOptions<ImageOptions> options) : IImageStorage
{
    public const string RequestPath = "/uploads";

    public string Folder => Path.Combine(env.ContentRootPath, options.Value.LocalPath);

    public async Task<string> SaveAsync(byte[] content, ImageKind kind, CancellationToken ct)
    {
        Directory.CreateDirectory(Folder);
        var name = $"{Guid.NewGuid():N}{ImageValidator.Extension(kind)}";
        await File.WriteAllBytesAsync(Path.Combine(Folder, name), content, ct);
        return $"{RequestPath}/{name}";
    }

    public Task DeleteAsync(string url, CancellationToken ct)
    {
        if (!url.StartsWith(RequestPath + "/")) return Task.CompletedTask;
        // Only ever delete a plain file name inside our folder.
        var name = Path.GetFileName(url);
        var path = Path.Combine(Folder, name);
        if (File.Exists(path)) File.Delete(path);
        return Task.CompletedTask;
    }
}

/// <summary>Production: stores images in an Azure Blob container with public read access.</summary>
public class BlobImageStorage : IImageStorage
{
    private readonly BlobContainerClient _container;
    private readonly string _publicBase;

    public BlobImageStorage(Microsoft.Extensions.Options.IOptions<ImageOptions> options)
    {
        var o = options.Value;
        _container = new BlobContainerClient(o.BlobConnectionString, o.BlobContainer);
        _publicBase = (o.PublicBaseUrl ?? _container.Uri.ToString()).TrimEnd('/');
    }

    public async Task<string> SaveAsync(byte[] content, ImageKind kind, CancellationToken ct)
    {
        await _container.CreateIfNotExistsAsync(PublicAccessType.Blob, cancellationToken: ct);
        var name = $"{Guid.NewGuid():N}{ImageValidator.Extension(kind)}";
        await _container.GetBlobClient(name).UploadAsync(new BinaryData(content), new BlobUploadOptions
        {
            HttpHeaders = new BlobHttpHeaders
            {
                ContentType = ImageValidator.ContentType(kind),
                CacheControl = "public, max-age=31536000, immutable",
            },
        }, ct);
        return $"{_publicBase}/{name}";
    }

    public async Task DeleteAsync(string url, CancellationToken ct)
    {
        if (!url.StartsWith(_publicBase + "/")) return;
        await _container.GetBlobClient(url[(_publicBase.Length + 1)..]).DeleteIfExistsAsync(cancellationToken: ct);
    }
}
