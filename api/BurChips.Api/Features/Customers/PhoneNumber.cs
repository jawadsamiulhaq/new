namespace BurChips.Api.Features.Customers;

public static class PhoneNumber
{
    /// <summary>
    /// Normalises a Pakistani mobile number to E.164 (+923XXXXXXXXX).
    /// Accepts 03XX-XXXXXXX, 3XXXXXXXXX, 923XXXXXXXXX and +92 3XX XXXXXXX (spaces/dashes ignored).
    /// Returns null if it isn't a valid mobile number.
    /// </summary>
    public static string? NormalizePakistaniMobile(string? input)
    {
        if (string.IsNullOrWhiteSpace(input)) return null;

        var digits = new string(input.Where(char.IsAsciiDigit).ToArray());
        var national = digits switch
        {
            { Length: 12 } when digits.StartsWith("92") => digits[2..],
            { Length: 11 } when digits.StartsWith('0') => digits[1..],
            { Length: 10 } => digits,
            _ => null,
        };

        return national is { Length: 10 } && national[0] == '3' ? "+92" + national : null;
    }

    /// <summary>"+923441858989" → "0344-1858989", the way customers write it.</summary>
    public static string ToLocal(string e164) =>
        e164.StartsWith("+92") && e164.Length == 13 ? $"0{e164[3..6]}-{e164[6..]}" : e164;
}
