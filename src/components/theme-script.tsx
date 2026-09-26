/**
 * Applies the saved theme before first paint so there is no flash of the
 * wrong colour scheme. Runs synchronously in the document head.
 */
export function ThemeScript() {
  const code = `(function(){try{var t=localStorage.getItem("aisa-theme");var d=t?t==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;

  return <script dangerouslySetInnerHTML={{ __html: code }} suppressHydrationWarning />;
}
