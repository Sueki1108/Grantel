
/// <reference lib="webworker" />

import * as pdfjs from 'pdfjs-dist/legacy/build/pdf';

// Defina o workerSrc a partir de uma CDN confiável.
// A versão deve corresponder à versão do 'pdfjs-dist' no seu package.json.
// Por exemplo, se a sua versão for 3.11.174, use o URL correspondente.
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

interface Job {
    file: File;
    id: number;
}

// Escuta por mensagens do thread principal
self.addEventListener('message', async (event: MessageEvent<Job>) => {
    const { file, id } = event.data;

    try {
        const arrayBuffer = await file.arrayBuffer();
        
        // Carrega o documento PDF
        const pdfDoc = await pdfjs.getDocument({ data: arrayBuffer }).promise;
        const numPages = pdfDoc.numPages;
        let fullText = '';

        // Itera sobre cada página para extrair o texto
        for (let i = 1; i <= numPages; i++) {
            const page = await pdfDoc.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map((item: any) => item.str).join(' ');
            fullText += pageText + '\n';
        }

        // Envia o resultado de volta para o thread principal
        self.postMessage({ id, text: fullText });

    } catch (error: any) {
        // Em caso de erro, envia uma mensagem de erro
        self.postMessage({ id, error: `Erro ao processar ${file.name}: ${error.message}` });
    }
});
