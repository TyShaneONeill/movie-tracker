import html2canvas from 'html2canvas';

export async function captureBugReportScreenshot(): Promise<string | null> {
  try {
    const canvas = await html2canvas(document.body, {
      backgroundColor: null,
      scale: 0.75,
      logging: false,
      useCORS: true,
    });
    const dataUrl = canvas.toDataURL('image/png');
    const base64 = dataUrl.split(',')[1];
    return base64 || null;
  } catch {
    return null;
  }
}
