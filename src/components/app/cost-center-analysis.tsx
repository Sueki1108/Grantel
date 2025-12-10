"use client";

import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileUploadForm } from "@/components/app/file-upload-form";
import { Cpu, Loader2, Database, UploadCloud, Check, ChevronsUpDown } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { processCostCenterData } from '@/lib/excel-processor';

interface CostCenterAnalysisProps {
    costCenterFile: File | null;
    onCostCenterFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onClearCostCenterFile: () => void;
    onDataProcessed: (map: Map<string, string>, debugKeys: any[], headers: any[]) => void;
    onDownloadCostCenterDebug: () => void;
    isProcessing: boolean;
}

export function CostCenterAnalysis({
    costCenterFile,
    onCostCenterFileChange,
    onClearCostCenterFile,
    onDataProcessed,
    onDownloadCostCenterDebug,
    isProcessing,
}: CostCenterAnalysisProps) {
    const { toast } = useToast();
    const [isMappingModalOpen, setIsMappingModalOpen] = useState(false);
    const [sheetHeaders, setSheetHeaders] = useState<string[]>([]);
    const [mappedDocNumber, setMappedDocNumber] = useState<string>('');
    const [mappedCnpj, setMappedCnpj] = useState<string>('');
    const [sheetData, setSheetData] = useState<any[][] | null>(null);

    useEffect(() => {
        if (costCenterFile) {
            handleFileLoad(costCenterFile);
        }
    }, [costCenterFile]);

    const handleFileLoad = async (file: File) => {
        try {
            const XLSX = await import('xlsx');
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            if (!sheetName) throw new Error("A planilha não contém abas.");
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            
            if (jsonData.length === 0) throw new Error("A planilha está vazia.");

            // Heurística para encontrar o cabeçalho
            let headerRowIndex = jsonData.findIndex(row => 
                Array.isArray(row) && row.some(cell => typeof cell === 'string' && /credor|fornecedor|documento/i.test(cell))
            );
            if (headerRowIndex === -1) headerRowIndex = 0; // Se não encontrar, assume a primeira linha

            const headers = (jsonData[headerRowIndex] as string[]).filter(Boolean);
            const dataRows = jsonData.slice(headerRowIndex + 1);

            setSheetHeaders(headers);
            setSheetData(dataRows);
            setIsMappingModalOpen(true);

        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Erro ao ler a planilha', description: err.message });
            onClearCostCenterFile();
        }
    };

    const handleProcessMapping = () => {
        if (!mappedDocNumber || !mappedCnpj) {
            toast({ variant: 'destructive', title: 'Mapeamento Incompleto', description: 'Por favor, selecione as colunas para "Número do Documento" e "CNPJ do Fornecedor".' });
            return;
        }

        if (!sheetData) {
            toast({ variant: 'destructive', title: 'Dados não encontrados', description: 'Não foi possível ler os dados da planilha.' });
            return;
        }

        try {
            const { costCenterMap, debugKeys, allCostCenters, costCenterHeaderRows } = processCostCenterData(
                sheetData,
                sheetHeaders,
                mappedDocNumber,
                mappedCnpj
            );

            onDataProcessed(costCenterMap, debugKeys, costCenterHeaderRows);

            toast({ title: 'Planilha de Centro de Custo Processada!', description: `${costCenterMap.size} mapeamentos encontrados.` });
            setIsMappingModalOpen(false);
            setMappedDocNumber('');
            setMappedCnpj('');

        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Erro no Processamento', description: err.message });
        }
    };

    return (
        <>
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <Database className="h-8 w-8 text-primary" />
                        <div>
                            <CardTitle className="font-headline text-2xl">Análise de Centro de Custo</CardTitle>
                            <CardDescription>
                                Carregue a planilha para mapear centros de custo aos itens e gere um relatório de depuração.
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div>
                        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                            <UploadCloud className="h-5 w-5" />
                            Carregar Planilha
                        </h3>
                        <FileUploadForm
                            displayName="Centro de Custo"
                            formId="cost-center"
                            files={{ 'cost-center': !!costCenterFile }}
                            onFileChange={onCostCenterFileChange}
                            onClearFile={onClearCostCenterFile}
                        />
                    </div>

                    <div>
                        <h3 className="text-lg font-bold mb-2">Ações de Depuração</h3>
                        <p className='text-sm text-muted-foreground mb-4'>
                            Após carregar e mapear a planilha, clique no botão abaixo para gerar um ficheiro Excel com as chaves de comparação e os centros de custo encontrados.
                        </p>
                        <Button
                            onClick={onDownloadCostCenterDebug}
                            disabled={isProcessing}
                        >
                            {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Cpu className="mr-2 h-4 w-4" />}
                            Gerar Chaves de Depuração do Centro de Custo
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Dialog open={isMappingModalOpen} onOpenChange={setIsMappingModalOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Mapear Colunas do Centro de Custo</DialogTitle>
                        <DialogDescription>
                            Selecione as colunas da sua planilha que correspondem aos campos necessários.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <label htmlFor="doc-number-select" className="text-right">Nº do Documento</label>
                            <ColumnSelector
                                headers={sheetHeaders}
                                selectedValue={mappedDocNumber}
                                onSelect={setMappedDocNumber}
                                placeholder="Selecione a coluna..."
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <label htmlFor="cnpj-select" className="text-right">CNPJ do Fornecedor</label>
                             <ColumnSelector
                                headers={sheetHeaders}
                                selectedValue={mappedCnpj}
                                onSelect={setMappedCnpj}
                                placeholder="Selecione a coluna..."
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setIsMappingModalOpen(false)}>Cancelar</Button>
                        <Button type="button" onClick={handleProcessMapping}>Processar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

// Sub-componente para o seletor de coluna
interface ColumnSelectorProps {
    headers: string[];
    selectedValue: string;
    onSelect: (value: string) => void;
    placeholder: string;
}

const ColumnSelector: React.FC<ColumnSelectorProps> = ({ headers, selectedValue, onSelect, placeholder }) => {
    const [open, setOpen] = useState(false);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="col-span-3 justify-between"
                >
                    {selectedValue
                        ? headers.find((header) => header === selectedValue)
                        : placeholder}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0">
                <Command>
                    <CommandInput placeholder="Procurar coluna..." />
                    <CommandEmpty>Nenhuma coluna encontrada.</CommandEmpty>
                    <CommandGroup>
                        {headers.map((header) => (
                            <CommandItem
                                key={header}
                                value={header}
                                onSelect={(currentValue) => {
                                    onSelect(currentValue === selectedValue ? "" : headers.find(h => h.toLowerCase() === currentValue) || '');
                                    setOpen(false);
                                }}
                            >
                                <Check
                                    className={cn(
                                        "mr-2 h-4 w-4",
                                        selectedValue === header ? "opacity-100" : "opacity-0"
                                    )}
                                />
                                {header}
                            </CommandItem>
                        ))}
                    </CommandGroup>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
