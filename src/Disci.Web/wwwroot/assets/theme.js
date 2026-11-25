/* DISCI Design System – cấu hình Tailwind (token màu dùng CSS variables để hỗ trợ sáng/tối) */
(function () {
  var c = function (n) { return 'rgb(var(--' + n + ') / <alpha-value>)'; };
  var names = ['primary','primary-container','primary-fixed','on-primary','on-primary-container','secondary','secondary-container',
    'surface','surface-bright','surface-container-lowest','surface-container-low','surface-container','surface-container-high','surface-container-highest',
    'on-surface','on-surface-variant','outline','outline-variant','background','error','error-container','on-error-container',
    'success','success-container','warning','warning-container','on-warning-container','on-success-container','inverse-surface','inverse-on-surface'];
  var colors = {}; names.forEach(function (n) { colors[n] = c(n); });
  window.tailwind = window.tailwind || {};
  tailwind.config = {
    darkMode: 'class',
    theme: { extend: {
      colors: colors,
      borderRadius: { DEFAULT: '0.375rem', lg: '0.75rem', xl: '1rem', '2xl': '1.25rem', full: '9999px' },
      spacing: { 'space-xs': '0.25rem', 'space-sm': '0.5rem', 'space-md': '1rem', 'space-lg': '1.5rem', 'space-xl': '2.5rem', gutter: '1rem', 'gutter-md': '1.5rem', margin: '1rem', 'margin-md': '2rem', 'margin-lg': '3rem' },
      fontFamily: { sans: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'], headline: ['Plus Jakarta Sans'], body: ['Plus Jakarta Sans'] },
      fontSize: {
        'label-sm': ['11px', { lineHeight: '14px', letterSpacing: '0.02em', fontWeight: '700' }],
        'label-md': ['12px', { lineHeight: '16px', fontWeight: '600' }],
        'label-lg': ['14px', { lineHeight: '20px', fontWeight: '600' }],
        'body-sm': ['14px', { lineHeight: '20px' }],
        'body-md': ['16px', { lineHeight: '24px' }],
        'headline-sm': ['20px', { lineHeight: '28px', letterSpacing: '-0.01em', fontWeight: '700' }],
        'headline-md': ['24px', { lineHeight: '32px', letterSpacing: '-0.015em', fontWeight: '700' }],
        'headline-lg': ['32px', { lineHeight: '40px', letterSpacing: '-0.02em', fontWeight: '800' }],
        'metric': ['34px', { lineHeight: '38px', letterSpacing: '-0.03em', fontWeight: '800' }]
      }
    } }
  };
})();
