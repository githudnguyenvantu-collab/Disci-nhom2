using Disci.Web.Models.Entities;
using Microsoft.AspNetCore.Identity;

namespace Disci.Web.Security;

/// <summary>Giữ đúng quy tắc mật khẩu của DISCI cũ: tối thiểu 8 ký tự, có ít nhất 1 chữ cái và 1 chữ số.</summary>
public class LetterAndDigitPasswordValidator : IPasswordValidator<ApplicationUser>
{
    public Task<IdentityResult> ValidateAsync(UserManager<ApplicationUser> manager, ApplicationUser user, string? password)
    {
        if (!string.IsNullOrEmpty(password) && password.Any(char.IsLetter) && password.Any(char.IsDigit)) return Task.FromResult(IdentityResult.Success);
        return Task.FromResult(IdentityResult.Failed(new IdentityError { Code = "LetterAndDigit", Description = "Mật khẩu phải có ít nhất 1 chữ cái và 1 chữ số." }));
    }
}
