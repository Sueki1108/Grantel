"use client";

import { useState, useMemo, type ChangeEvent } from 'react';
import * as XLSX from 'xlsx';
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { FileUp, Loader2, Download, Cpu, TicketPercent, Copy, AlertTriangle, FileDown, Calendar as CalendarIcon, Bot, Settings } from 'lucide-react';
import JSZip from 'jszip';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from './data-table';
import { getColumnsWithCustomRender } from '@/lib/columns-helper';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Calendar } from '../ui/calendar';
import { generateGnreScript, GNRE_DEFAULT_CONFIGS, GnreConfig } from '@/lib/gnre-script-generator';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogContent, DialogTrigger, DialogFooter } from '../ui/dialog';
import { Input } from '../ui/input';
import { ScrollArea } from '../ui/scroll-area';

// ===============================================================
// Tipos
// ===============================================================

type GnreDataItem = {
    filename: string;
    chave_acesso: string;
    valor_principal_calculado: number;
    valor_principal_gnre: string;
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

const parseXmlData = (xmlText: string, filename: string): GnreDataItem | null => {
    try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "application/xml");
        const root = xmlDoc.documentElement;

        let chaveAcesso: string | null = null;
        const chNFeElement = root.querySelector('chNFe'); 
        if (chNFeElement?.textContent) {
            chaveAcesso = chNFeElement.textContent;
        } else {
            const infNFeElement = root.querySelector('infNFe');
            const idAttr = infNFeElement?.getAttribute('Id');
            if (idAttr && idAttr.startsWith('NFe')) {
                chaveAcesso = idAttr.substring(3);
            }
        }
        
        if (!chaveAcesso || chaveAcesso.length !== 44) {
            console.warn(`Chave de acesso inválida ou não encontrada em ${filename}.`);
            return null;
        }

        const vNFElement = root.querySelector('vNF');
        const vNFText = vNFElement?.textContent;

        if (!vNFText) {
            console.warn(`Valor <vNF> não encontrado em ${filename}.`);
            return null;
        }
        
        const valorNf = parseFloat(vNFText);
        const valorPrincipal = parseFloat((valorNf * 0.10).toFixed(2));
        const valorPrincipalGnre = String(Math.round(valorPrincipal * 100));

        return {
            filename: filename,
            chave_acesso: chaveAcesso,
            valor_principal_calculado: valorPrincipal,
            valor_principal_gnre: valorPrincipalGnre,
        };

    } catch (e) {
        console.error(`ERRO ao processar '${filename}'. Detalhes: ${e}`);
        return null;
    }
};

// ===============================================================
// Main Component
// ===============================================================
export function DifalAnalysis() {
    const [xmlFiles, setXmlFiles] = useState<File[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [gnreData, setGnreData] = useState<GnreDataItem[]>([]);
    const [dueDate, setDueDate] = useState<Date | undefined>(new Date());
    const [gnreConfigs, setGnreConfigs] = useState<GnreConfig>(GNRE_DEFAULT_CONFIGS);
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

    const processXmlForGnre = async () => {
        if (xmlFiles.length === 0) {
            toast({ variant: "destructive", title: "Nenhum XML carregado", description: "Por favor, carregue os ficheiros XML de devolução." });
            return;
        }

        setIsLoading(true);
        setGnreData([]);
        
        const processedItems: GnreDataItem[] = [];
        
        for (const file of xmlFiles) {
            try {
                const xmlText = await readFileAsText(file);
                const data = parseXmlData(xmlText, file.name);
                if (data) {
                    processedItems.push(data);
                }
            } catch (err) {
                console.error("Erro ao processar ficheiro", file.name, err);
            }
        }
        
        setGnreData(processedItems);
        setIsLoading(false);
        toast({ title: "Processamento Concluído", description: `${processedItems.length} XMLs válidos encontrados e prontos para gerar o script.` });
    };

    const handleGenerateAndDownloadScript = () => {
        if (gnreData.length === 0) {
            toast({ variant: 'destructive', title: 'Nenhum dado processado', description: 'Processe os ficheiros XML primeiro.' });
            return;
        }
        if (!dueDate) {
             toast({ variant: 'destructive', title: 'Data de Vencimento em falta', description: 'Por favor, selecione uma data de vencimento para a guia.' });
            return;
        }

        try {
            const dataUnica = format(dueDate, 'dd/MM/yyyy');
            const scriptContent = generateGnreScript(gnreData, dataUnica, dataUnica, gnreConfigs);
            
            const blob = new Blob([scriptContent], { type: 'text/python;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'script_automacao_gnre.py';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
            toast({ title: 'Script Gerado com Sucesso', description: 'O ficheiro script_automacao_gnre.py está a ser descarregado.' });
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Erro ao Gerar Script', description: error.message });
        }
    };
    
    const handleConfigChange = (e: ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setGnreConfigs(prev => ({ ...prev, [name]: value }));
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <TicketPercent className="h-8 w-8 text-primary" />
                            <div>
                                <CardTitle className="font-headline text-2xl">Gerador de Script para Automação de Guias DIFAL (GNRE)</CardTitle>
                                <CardDescription>
                                    Carregue os XMLs de devolução, defina a data, e gere um script Python para automatizar o preenchimento das guias GNRE no portal de Pernambuco.
                                </CardDescription>
                            </div>
                        </div>
                         <Dialog>
                            <DialogTrigger asChild>
                                <Button variant="outline" size="sm"><Settings className="mr-2 h-4 w-4"/>Configurações Avançadas</Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl">
                                <DialogHeader>
                                    <DialogTitle>Configurações Padrão do Script GNRE</DialogTitle>
                                    <DialogDescription>
                                        Altere os valores padrão que serão usados no script de automação.
                                    </DialogDescription>
                                </DialogHeader>
                                <ScrollArea className="max-h-[60vh] p-1">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
                                        {Object.entries(gnreConfigs).map(([key, value]) => (
                                            <div key={key} className="space-y-1">
                                                <Label htmlFor={key} className="text-xs font-semibold capitalize">{key.replace(/_/g, ' ')}</Label>
                                                <Input id={key} name={key} value={value} onChange={handleConfigChange} className="h-8 text-sm"/>
                                            </div>
                                        ))}
                                    </div>
                                </ScrollArea>
                                <DialogFooter>
                                    <DialogTrigger asChild>
                                        <Button>Fechar</Button>
                                    </DialogTrigger>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </div>
                </CardHeader>
                <CardContent className="space-y-8">
                    <div>
                        <h3 className="text-lg font-bold mb-4">Etapa 1: Carregar XMLs e Definir Data</h3>
                        <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                            <div className='flex flex-col gap-2'>
                                <Label>Carregar XMLs de Devolução (.xml ou .zip)</Label>
                                <label htmlFor="xml-upload-difal" className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 cursor-pointer hover:border-primary transition-colors h-full">
                                    <FileUp className="h-8 w-8 text-muted-foreground mb-1" />
                                    <span className="font-semibold text-sm">Clique ou arraste para carregar</span>
                                    <input id="xml-upload-difal" type="file" className="sr-only" onChange={handleXmlFileChange} multiple accept=".xml,.zip" />
                                </label>
                                {xmlFiles.length > 0 && <div className="text-sm text-muted-foreground"><span className="font-bold">{xmlFiles.length}</span> ficheiro(s) XML pronto(s).</div>}
                            </div>
                            <div>
                                <Label htmlFor='due-date'>Data de Vencimento/Pagamento da Guia</Label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button
                                            id="due-date"
                                            variant={"outline"}
                                            className={cn(
                                                "w-full justify-start text-left font-normal",
                                                !dueDate && "text-muted-foreground"
                                            )}
                                        >
                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                            {dueDate ? format(dueDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : <span>Selecione uma data</span>}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0">
                                        <Calendar
                                            mode="single"
                                            selected={dueDate}
                                            onSelect={setDueDate}
                                            initialFocus
                                        />
                                    </PopoverContent>
                                </Popover>
                            </div>
                        </div>
                    </div>
                    
                    <div className="relative"><div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div><div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">Etapa 2</span></div></div>

                    <div>
                        <h3 className="text-lg font-bold mb-2">Etapa 2: Processar e Gerar Script</h3>
                        <p className='text-sm text-muted-foreground mb-4'>Clique para extrair os dados dos XMLs. Depois, poderá gerar o script de automação.</p>
                        <div className='flex flex-col sm:flex-row gap-4'>
                            <Button onClick={processXmlForGnre} disabled={isLoading || xmlFiles.length === 0} className="w-full">
                                {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Processando...</> : <><Cpu className="mr-2 h-4 w-4" /> Processar XMLs</>}
                            </Button>
                             <Button onClick={handleGenerateAndDownloadScript} disabled={gnreData.length === 0} className="w-full">
                                <Bot className="mr-2 h-4 w-4" /> Gerar e Baixar Script de Automação
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {gnreData.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Dados Extraídos dos XMLs</CardTitle>
                        <CardDescription>
                            Os seguintes dados foram extraídos e serão incluídos no script de automação.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                       <DataTable 
                            columns={[
                                { accessorKey: 'filename', header: 'Nome do Ficheiro' },
                                { accessorKey: 'chave_acesso', header: 'Chave de Acesso' },
                                { accessorKey: 'valor_principal_calculado', header: 'Valor do Imposto (10%)', cell: ({row}) => (row.original as GnreDataItem).valor_principal_calculado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })},
                            ]}
                            data={gnreData}
                       />
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
