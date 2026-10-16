using BurChips.Api.Features.Customers;

namespace BurChips.Api.Tests;

public class PhoneNumberTests
{
    [Theory]
    [InlineData("0344-1858989", "+923441858989")]
    [InlineData("03441858989", "+923441858989")]
    [InlineData("3441858989", "+923441858989")]
    [InlineData("923441858989", "+923441858989")]
    [InlineData("+92 344 1858989", "+923441858989")]
    [InlineData(" 0300 1234567 ", "+923001234567")]
    public void Normalizes_pakistani_mobiles(string input, string expected) =>
        Assert.Equal(expected, PhoneNumber.NormalizePakistaniMobile(input));

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("042-35700000")] // Lahore landline
    [InlineData("0344-185898")] // too short
    [InlineData("+44 7700 900123")] // not Pakistani
    [InlineData("abc")]
    public void Rejects_non_mobile_numbers(string? input) =>
        Assert.Null(PhoneNumber.NormalizePakistaniMobile(input));

    [Fact]
    public void Formats_for_display() =>
        Assert.Equal("0344-1858989", PhoneNumber.ToLocal("+923441858989"));
}
