// Deferred XLSX support. Keep this ~1MB dependency off the critical page load.
// The browser shares the one import promise across every import on this page.
let excelPromise;
export async function loadExcelJS(){
  if(window.ExcelJS)return window.ExcelJS;
  if(!excelPromise){
    excelPromise=new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src=new URL('../vendor/exceljs.min.js',import.meta.url).href;
      script.async=true;
      script.crossOrigin='anonymous';
      const timer=setTimeout(()=>{
        script.remove();
        reject(new Error('Excel importer took too long. Check your connection or try a CSV file.'));
      },20000);
      script.onload=()=>{
        clearTimeout(timer);
        if(window.ExcelJS)resolve(window.ExcelJS);
        else reject(new Error('Excel library did not initialise.'));
      };
      script.onerror=()=>{
        clearTimeout(timer);
        reject(new Error('Excel importer could not download. Please retry or use CSV.'));
      };
      document.head.append(script);
    }).catch(error=>{excelPromise=undefined;throw error;});
  }
  return excelPromise;
}
