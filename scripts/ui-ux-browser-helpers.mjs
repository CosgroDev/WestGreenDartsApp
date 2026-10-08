// Links cannot use HTML disabled. Wait for the application's explicit save guard
// before leaving a scoring screen, then wait for the destination to render.
export async function pauseAndWait(page) {
  await page.waitForFunction(() => {
    const link = [...document.querySelectorAll('a')].find(a => a.textContent.trim() === 'Pause & save');
    return link && link.getAttribute('aria-disabled') !== 'true';
  });
  await page.getByRole('link', { name: 'Pause & save', exact: true }).click();
  await page.waitForURL(url => url.pathname === '/practice');
  await page.getByRole('heading', { name: 'Continue playing', exact: true }).waitFor();
}
