/* Cubit Builder — pdflib.js : the PDF maker (jsPDF) is loaded the first time it's needed, not when the app opens
   (it's 350 KB the app doesn't use until a PDF is made). warmPDF() fetches it quietly a few seconds after start-up,
   so making a PDF is still instant, and the offline copy keeps it (sw.js). */
const URL_ = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
let loading = null;
export function needPDF(){
  if(window.jspdf) return Promise.resolve(window.jspdf);
  return loading ||= new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = URL_; s.async = true;
    s.onload = () => res(window.jspdf);
    s.onerror = () => { loading = null; s.remove(); rej(new Error('The PDF maker could not load. Check the connection and try again.')); };
    document.head.appendChild(s);
  });
}
export function warmPDF(after = 6000){
  const go = () => needPDF().catch(()=>{});
  setTimeout(() => ('requestIdleCallback' in window) ? requestIdleCallback(go, { timeout:8000 }) : go(), after);
}
