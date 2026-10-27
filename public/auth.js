'use strict';

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-password-toggle]').forEach(button => {
    button.addEventListener('click', () => {
      const input = document.getElementById(button.dataset.passwordToggle);
      if (!input) return;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      button.textContent = show ? 'Hide' : 'Show';
      button.setAttribute('aria-label', `${show ? 'Hide' : 'Show'} password`);
    });
  });

  const password = document.getElementById('password');
  const bar = document.getElementById('strength-bar');
  const caption = document.getElementById('password-strength');
  if (!password || !bar || !caption) return;

  password.addEventListener('input', () => {
    const value = password.value;
    const checks = [
      value.length >= 10,
      /[a-z]/.test(value),
      /[A-Z]/.test(value),
      /[0-9]/.test(value),
      value.length >= 14,
    ];
    const score = checks.filter(Boolean).length;
    bar.style.width = `${score * 20}%`;
    bar.dataset.strength = score >= 4 ? 'strong' : score >= 3 ? 'medium' : 'weak';
    caption.textContent = !value ? 'Use 10+ characters with uppercase, lowercase, and a number.'
      : score >= 4 ? 'Strong password'
        : score >= 3 ? 'Getting stronger — add more length or variety.'
          : 'Add at least 10 characters, uppercase, lowercase, and a number.';
  });
});
