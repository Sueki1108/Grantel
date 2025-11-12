
"use client";

import { useState, useMemo, type ChangeEvent } from 'react';
import * as XLSX from 'xlsx';
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { FileUp, Loader2, Download, Cpu, TicketPercent, Copy } from 'lucide-react';
import JSZip from 'jszip';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { DataTable } from '@/components/app/data-table';
import { getColumnsWithCustomRender } from '@/lib/columns-helper';

// ===============================================================
// Tipos
// ===============================================================

type DifalData = {
    'Chave de Acesso': string;
    'Número da Nota': string;
    'Data de Emissão': string;
    'Valor Total da Nota': number;
    'Valor da Guia (10%)': number;
    'Encontrado "SELVIRIA/PR"': 'Sim' | 'Não';
};


// ===============================================================
// Helper Functions
// ===============================================================
const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            if (event.target && event.target.result instanceof ArrayBuffer) {
                const buffer = event.target.result;
                try {
                    const decoder = new TextDecoder('utf-8', { fatal: true });
                    resolve(decoder.decode(buffer));
                } catch (e) {
                    const decoder = new TextDecoder('iso-8859-1');
                    resolve(decoder.decode(buffer));
                }
            } else {
                reject(new Error('Falha ao ler o ficheiro como ArrayBuffer.'));
            }
        };
        reader.onerror = () => reject(new Error(`Erro ao ler o ficheiro: ${file.name}`));
        reader.readAsArrayBuffer(file);
    });
};

const getTagValue = (element: Element | null, query: string): string => {
    if (!element) return '';
    const tag = element.querySelector(query);
    return tag?.textContent ?? '';
};


// ===============================================================
// Main Component
// ===============================================================
export function DifalAnalysis() {
    const [xmlFiles, setXmlFiles] = useState<File[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [difalData, setDifalData] = useState<DifalData[]>([]);

    const { toast } = useToast();
    
    const handleXmlFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = e.target.files;
        if (!selectedFiles) return;
        
        let newFiles: File[] = [];
        let extractedCount = 0;

        for (const file of Array.from(selectedFiles)) {
             if (file.type === 'application/zip' || file.name.toLowerCase().endsWith('.zip')) {
                try {
                    const zip = await JSZip.loadAsync(file);
                    for (const relativePath in zip.files) {
                        const zipEntry = zip.files[relativePath];
                        if (!zipEntry?.dir && relativePath.toLowerCase().endsWith('.xml')) {
                            const content = await zipEntry.async('string');
                            newFiles.push(new File([content], zipEntry.name, { type: 'application/xml' }));
                            extractedCount++;
                        }
                    }
                } catch (error) {
                    toast({ variant: "destructive", title: `Erro ao descompactar ${file.name}` });
                }
            } else if (file.type === 'text/xml' || file.name.toLowerCase().endsWith('.xml')) {
                newFiles.push(file);
            }
        }
        
        setXmlFiles(prev => [...prev, ...newFiles]);
        toast({ title: `${newFiles.length} ficheiro(s) XML adicionados.`, description: `${extractedCount > 0 ? `(${extractedCount} de .zip)` : ''} Clique em processar para analisar.` });
    };

    const processXmls = async () => {
        if (xmlFiles.length === 0) {
            toast({ variant: "destructive", title: "Nenhum XML carregado", description: "Por favor, carregue os ficheiros XML." });
            return;
        }

        setIsLoading(true);
        setDifalData([]);
        
        const processedItems: DifalData[] = [];
        const parser = new DOMParser();

        for (const file of xmlFiles) {
            try {
                const xmlText = await readFileAsText(file);
                const xmlDoc = parser.parseFromString(xmlText, "application/xml");
                const infNFe = xmlDoc.querySelector('infNFe');
                if (!infNFe) continue;

                const chaveAcesso = infNFe.getAttribute('Id')?.replace('NFe', '') || 'N/A';
                const nNF = getTagValue(infNFe, 'ide > nNF');
                const dhEmi = getTagValue(infNFe, 'ide > dhEmi');
                const vNF = parseFloat(getTagValue(infNFe, 'total > ICMSTot > vNF') || '0');
                const infCpl = getTagValue(infNFe, 'infAdic > infCpl');

                processedItems.push({
                    'Chave de Acesso': chaveAcesso,
                    'Número da Nota': nNF,
                    'Data de Emissão': dhEmi,
                    'Valor Total da Nota': vNF,
                    'Valor da Guia (10%)': parseFloat((vNF * 0.1).toFixed(2)),
                    'Encontrado "SELVIRIA/PR"': infCpl.toUpperCase().includes("SELVIRIA/PR") ? 'Sim' : 'Não',
                });

            } catch (err) {
                console.error("Erro ao processar ficheiro", file.name, err);
            }
        }
        
        setDifalData(processedItems);
        setIsLoading(false);
        toast({ title: "Processamento Concluído", description: `${processedItems.length} XMLs analisados.` });
    };
    
    const handleDownloadExcel = () => {
        if (difalData.length === 0) {
            toast({ variant: 'destructive', title: 'Nenhum dado para exportar' });
            return;
        }

        const dataToExport = difalData.map(item => ({
            ...item,
            'Data de Emissão': item['Data de Emissão'] ? format(parseISO(item['Data de Emissão']), 'dd/MM/yyyy') : 'N/A',
        }));

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Dados DIFAL');
        XLSX.writeFile(workbook, `Relatorio_DIFAL.xlsx`);
        toast({ title: 'Relatório Excel Gerado' });
    };

    const columns = useMemo(() => getColumnsWithCustomRender(
        difalData, 
        ['Número da Nota', 'Chave de Acesso', 'Data de Emissão', 'Valor Total da Nota', 'Valor da Guia (10%)', 'Encontrado "SELVIRIA/PR"'],
        (row, id) => {
             const value = row.original[id as keyof DifalData];
             if (id === 'Data de Emissão' && typeof value === 'string') {
                 return format(parseISO(value), 'dd/MM/yyyy');
             }
             if (typeof value === 'number') {
                 return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
             }
             return String(value);
        }
    ), [difalData]);


    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <TicketPercent className="h-8 w-8 text-primary" />
                        <div>
                            <CardTitle className="font-headline text-2xl">Ferramenta de Extração para Guia DIFAL</CardTitle>
                            <CardDescription>
                                Carregue os XMLs de saída, processe os dados e exporte um relatório para facilitar a criação das guias.
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-8">
                    <div>
                        <h3 className="text-lg font-bold mb-4">Etapa 1: Carregar XMLs</h3>
                        <div className='flex flex-col gap-2'>
                            <label htmlFor="xml-upload-difal" className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 cursor-pointer hover:border-primary transition-colors h-full">
                                <FileUp className="h-8 w-8 text-muted-foreground mb-1" />
                                <span className="font-semibold text-sm">Clique ou arraste para carregar XMLs ou .zip</span>
                                <input id="xml-upload-difal" type="file" className="sr-only" onChange={handleXmlFileChange} multiple accept=".xml,.zip" />
                            </label>
                            {xmlFiles.length > 0 && <div className="text-sm text-muted-foreground"><span className="font-bold">{xmlFiles.length}</span> ficheiro(s) carregados.</div>}
                        </div>
                    </div>
                    
                    <div className="relative"><div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div><div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">Etapa 2</span></div></div>

                    <div>
                        <h3 className="text-lg font-bold mb-2">Etapa 2: Processar e Exportar</h3>
                         <p className='text-sm text-muted-foreground mb-4'>Clique para extrair os dados dos XMLs. Depois, poderá baixar a planilha.</p>
                        <div className='flex flex-col sm:flex-row gap-4'>
                            <Button onClick={processXmls} disabled={isLoading || xmlFiles.length === 0} className="w-full">
                                {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Processando...</> : <><Cpu className="mr-2 h-4 w-4" /> Processar XMLs</>}
                            </Button>
                             <Button onClick={handleDownloadExcel} disabled={difalData.length === 0} className="w-full">
                                <Download className="mr-2 h-4 w-4" /> Baixar Excel
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {difalData.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Dados Extraídos para DIFAL</CardTitle>
                        <CardDescription>
                            Os seguintes dados foram extraídos dos XMLs carregados.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                       <DataTable 
                            columns={columns}
                            data={difalData}
                       />
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
