
"use client";

import React, { useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileUploadForm } from "@/components/app/file-upload-form";
import type { ProcessedData } from '@/lib/excel-processor';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { GitCompareArrows, AlertTriangle, Download, FileSearch, Loader2, Cpu, BarChart, Ticket, X, RotateCw, HelpCircle, FileDown } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from "@/components/app/data-table";
import { getColumns } from "@/components/app/columns-helper";
import { SiengeTaxCheck } from './sienge-tax-check';
import { ColumnDef, Row } from '@tanstack/react-table';
import { CfopValidator } from './cfop-validator';
import { AllClassifications, DifalStatus } from './imobilizado-analysis';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';


interface ReconciliationAnalysisProps {
    processedData: ProcessedData | null;
    siengeFile: File | null;
    costCenterFile: File | null;
    onSiengeFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onCostCenterFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onClearSiengeFile: () => void;
    onClearCostCenterFile: () => void;
    onRunReconciliation: () => void;
    isReconciliationRunning: boolean;
    allClassifications: AllClassifications;
    onPersistClassifications: (allData: AllClassifications) => void;
    competence: string | null;
}

const getColumnsForDivergentTabs = (data: any[]): ColumnDef<any>[] => {
    if (!data || data.length === 0) return [];

    const hasKeyColumn = data[0] && 'Chave de Comparação' in data[0];
    
    let allColumns = getColumns(data);

    if (hasKeyColumn) {
        const keyColumn = allColumns.find(col => col.id === 'Chave de Comparação');
        const otherColumns = allColumns.filter(col => col.id !== 'Chave de Comparação');
        if (keyColumn) {
            return [keyColumn, ...otherColumns];
        }
    }
    
    return allColumns;
};


export function ReconciliationAnalysis({ 
    processedData, 
    siengeFile, 
    costCenterFile,
    onSiengeFileChange, 
    onCostCenterFileChange,
    onClearSiengeFile,
    onClearCostCenterFile,
    onRunReconciliation,
    isReconciliationRunning,
    allClassifications,
    onPersistClassifications,
    competence
}: ReconciliationAnalysisProps) {
    const { toast } = useToast();
    
    const { reconciliationResults, siengeDataForTaxCheck } = useMemo(() => {
        return {
            reconciliationResults: processedData?.reconciliationResults,
            siengeDataForTaxCheck: processedData?.siengeSheetData,
        };
    }, [processedData]);

    const difalItems = useMemo(() => {
        const cfopValidations = (competence && allClassifications[competence]?.cfopValidations?.classifications) || {};
        return (processedData?.reconciliationResults?.reconciled || []).filter(item => {
            const uniqueKey = `${(item['CPF/CNPJ do Emitente'] || '').replace(/\D/g, '')}-${(item['Código'] || '')}-${item['Sienge_CFOP']}`;
            return cfopValidations[uniqueKey]?.isDifal === true;
        });
    }, [processedData?.reconciliationResults?.reconciled, competence, allClassifications]);
    
    const handleDifalStatusChange = (itemsToUpdate: any[], newStatus: DifalStatus) => {
        if (!competence) return;

        const newClassifications = { ...allClassifications };
        if (!newClassifications[competence]) newClassifications[competence] = { classifications: {}, accountCodes: {}, cfopValidations: { classifications: {} }, difalValidations: { classifications: {} }};
        if (!newClassifications[competence].difalValidations) newClassifications[competence].difalValidations = { classifications: {} };
        
        itemsToUpdate.forEach(item => {
            const itemKey = `${(item['CPF/CNPJ do Emitente'] || '').replace(/\D/g, '')}-${(item['Código'] || '')}-${item['Sienge_CFOP']}`;
            newClassifications[competence].difalValidations!.classifications[itemKey] = { status: newStatus };
        });

        onPersistClassifications(newClassifications);
        toast({ title: 'Classificação DIFAL atualizada!'});
    };
    
    const handleDownload = (data: any[], title: string) => {
        if (!data || data.length === 0) {
            toast({ title: "Nenhum dado para exportar", description: `Não há itens na aba "${title}".` });
            return;
        }
        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, title);
        const fileName = `Grantel - Conciliação ${title}.xlsx`;
        XLSX.writeFile(workbook, fileName);
    };

    const handleDownloadDebugKeys = () => {
        if (!reconciliationResults?.debug || (!reconciliationResults.debug.costCenterKeys.length && !reconciliationResults.debug.siengeKeys.length)) {
            toast({ variant: 'destructive', title: 'Nenhum dado de depuração para exportar', description: 'Certifique-se de que ambas as planilhas estão carregadas e a conciliação foi executada.' });
            return;
        }

        const wb = XLSX.utils.book_new();
        
        if (reconciliationResults.debug.costCenterKeys.length > 0) {
            const ws = XLSX.utils.json_to_sheet(reconciliationResults.debug.costCenterKeys);
            XLSX.utils.book_append_sheet(wb, ws, "Chaves_Centro_Custo");
        }
        if (reconciliationResults.debug.siengeKeys.length > 0) {
            const ws = XLSX.utils.json_to_sheet(reconciliationResults.debug.siengeKeys);
            XLSX.utils.book_append_sheet(wb, ws, "Chaves_Sienge");
        }

        if (wb.SheetNames.length === 0) {
             toast({ variant: 'destructive', title: 'Nenhum dado de depuração para exportar.' });
            return;
        }

        XLSX.writeFile(wb, "Grantel_Debug_Chaves_Conciliacao.xlsx");
        toast({ title: 'Ficheiro de Depuração Gerado' });
    }
    
    return (
         <Card>
            <CardHeader>
                <div className="flex items-center gap-3">
                    <GitCompareArrows className="h-8 w-8 text-primary" />
                    <div>
                        <CardTitle className="font-headline text-2xl">XML VS Sienge</CardTitle>
                        <CardDescription>Carregue as planilhas para cruzar informações com os XMLs processados.</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
                 <div className='grid grid-cols-1 md:grid-cols-3 gap-6 items-end'>
                    <FileUploadForm
                        displayName="Itens do Sienge"
                        formId="sienge-for-reconciliation"
                        files={{ 'sienge-for-reconciliation': !!siengeFile }}
                        onFileChange={onSiengeFileChange}
                        onClearFile={onClearSiengeFile}
                    />
                     <FileUploadForm
                        displayName="Centro de Custo"
                        formId="cost-center"
                        files={{ 'cost-center': !!costCenterFile }}
                        onFileChange={onCostCenterFileChange}
                        onClearFile={onClearCostCenterFile}
                    />
                    <div className='flex flex-col gap-2'>
                        <Button onClick={onRunReconciliation} disabled={!siengeFile || !processedData || isReconciliationRunning} className="w-full">
                            {isReconciliationRunning ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> A Conciliar...</> : <><Cpu className="mr-2 h-4 w-4"/>Conciliar XML vs Sienge</>}
                        </Button>
                        <Button onClick={handleDownloadDebugKeys} disabled={!reconciliationResults} variant="outline" size="sm" className="w-full">
                            <FileDown className="mr-2 h-4 w-4"/>Baixar Chaves de Depuração
                        </Button>
                    </div>
                </div>
                
                <Tabs defaultValue="reconciliation">
                    <TabsList className="grid w-full grid-cols-4">
                        <TabsTrigger value="reconciliation" disabled={!reconciliationResults}>Conciliação de Itens</TabsTrigger>
                        <TabsTrigger value="tax_check" disabled={!siengeDataForTaxCheck}>Conferência de Impostos</TabsTrigger>
                        <TabsTrigger value="cfop_validation" disabled={!reconciliationResults}><BarChart className='h-4 w-4 mr-2'/>Validação CFOP</TabsTrigger>
                        <TabsTrigger value="difal" disabled={difalItems.length === 0}><Ticket className='h-4 w-4 mr-2'/>DIFAL ({difalItems.length})</TabsTrigger>
                    </TabsList>
                    <TabsContent value="reconciliation" className="mt-4">
                         {!processedData?.sheets['Itens Válidos'] && (
                             <Alert variant="destructive">
                                <AlertTriangle className="h-4 w-4" />
                                <AlertTitle>Dados XML em falta</AlertTitle>
                                <AlertDescription>
                                    Processe os XMLs na primeira aba para habilitar a conciliação.
                                </AlertDescription>
                            </Alert>
                        )}
                        {reconciliationResults ? (
                            <div className="mt-6">
                                <Tabs defaultValue="reconciled">
                                    <TabsList className="grid w-full grid-cols-3">
                                        <TabsTrigger value="reconciled">Conciliados ({reconciliationResults.reconciled.length})</TabsTrigger>
                                        <TabsTrigger value="onlyInSienge">Apenas no Sienge ({reconciliationResults.onlyInSienge.length})</TabsTrigger>
                                        <TabsTrigger value="onlyInXml">Apenas no XML ({reconciliationResults.onlyInXml.length})</TabsTrigger>
                                    </TabsList>
                                    <div className="mt-4">
                                        <TabsContent value="reconciled">
                                            <Button onClick={() => handleDownload(reconciliationResults.reconciled, 'Itens_Conciliados')} size="sm" className="mb-4" disabled={reconciliationResults.reconciled.length === 0}><Download className="mr-2 h-4 w-4"/> Baixar</Button>
                                            <DataTable columns={getColumns(reconciliationResults.reconciled)} data={reconciliationResults.reconciled} />
                                        </TabsContent>
                                        <TabsContent value="onlyInSienge">
                                            <Button onClick={() => handleDownload(reconciliationResults.onlyInSienge, 'Itens_Apenas_Sienge')} size="sm" className="mb-4" disabled={reconciliationResults.onlyInSienge.length === 0}><Download className="mr-2 h-4 w-4"/> Baixar</Button>
                                            <DataTable columns={getColumnsForDivergentTabs(reconciliationResults.onlyInSienge)} data={reconciliationResults.onlyInSienge} />
                                        </TabsContent>
                                        <TabsContent value="onlyInXml">
                                            <Button onClick={() => handleDownload(reconciliationResults.onlyInXml, 'Itens_Apenas_XML')} size="sm" className="mb-4" disabled={reconciliationResults.onlyInXml.length === 0}><Download className="mr-2 h-4 w-4"/> Baixar</Button>
                                            <DataTable columns={getColumnsForDivergentTabs(reconciliationResults.onlyInXml)} data={reconciliationResults.onlyInXml} />
                                        </TabsContent>
                                    </div>
                                </Tabs>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center min-h-[300px] text-muted-foreground border-2 border-dashed rounded-lg p-8">
                                <FileSearch className="h-12 w-12 text-primary" />
                                <p className="mt-4 text-center">Carregue as planilhas e clique no botão "Conciliar XML vs Sienge" para ver os resultados.</p>
                            </div>
                        )}
                    </TabsContent>
                    
                    <TabsContent value="tax_check" className="mt-4">
                        <SiengeTaxCheck siengeData={siengeDataForTaxCheck} />
                    </TabsContent>
                    
                    <TabsContent value="cfop_validation" className="mt-4">
                        <CfopValidator 
                            items={reconciliationResults?.reconciled || []}
                            allPersistedData={allClassifications}
                            onPersistData={onPersistClassifications}
                            competence={competence}
                        />
                    </TabsContent>

                    <TabsContent value="difal" className="mt-4">
                        <DifalItemsAnalysis 
                            items={difalItems} 
                            allClassifications={allClassifications} 
                            competence={competence} 
                            onClassificationChange={handleDifalStatusChange}
                        />
                    </TabsContent>
                </Tabs>
            </CardContent>
         </Card>
    );
}

// Sub-component for DIFAL Analysis
interface DifalItemsAnalysisProps {
    items: any[];
    allClassifications: AllClassifications;
    competence: string | null;
    onClassificationChange: (items: any[], newStatus: DifalStatus) => void;
}

function DifalItemsAnalysis({ items, allClassifications, competence, onClassificationChange }: DifalItemsAnalysisProps) {
    
    const { subject, disregarded } = useMemo(() => {
        const difalValidations = (competence && allClassifications[competence]?.difalValidations?.classifications) || {};
        const subject: any[] = [];
        const disregarded: any[] = [];

        items.forEach(item => {
            const itemKey = `${(item['CPF/CNPJ do Emitente'] || '').replace(/\D/g, '')}-${(item['Código'] || '')}-${item['Sienge_CFOP']}`;
            const status = difalValidations[itemKey]?.status || 'subject-to-difal';

            if (status === 'disregard') {
                disregarded.push(item);
            } else {
                subject.push(item);
            }
        });

        return { subject, disregarded };
    }, [items, allClassifications, competence]);

    const difalColumns = useMemo(() => {
        const baseCols = getColumns(items.length > 0 ? items : [{}]);
        
        baseCols.push({
            id: 'actions',
            header: 'Ações',
            cell: ({row}) => {
                 const itemKey = `${(row.original['CPF/CNPJ do Emitente'] || '').replace(/\D/g, '')}-${(row.original['Código'] || '')}-${row.original['Sienge_CFOP']}`;
                 const status = (competence && allClassifications[competence]?.difalValidations?.classifications[itemKey]?.status) || 'subject-to-difal';

                return (
                    <div className="flex gap-1 justify-center">
                        <TooltipProvider>
                            {status !== 'disregard' && (
                                 <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onClassificationChange([row.original], 'disregard')}><X className="h-4 w-4 text-red-600"/></Button></TooltipTrigger><TooltipContent><p>Desconsiderar</p></TooltipContent></Tooltip>
                            )}
                            {status === 'disregard' && (
                                <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onClassificationChange([row.original], 'subject-to-difal')}><RotateCw className="h-4 w-4"/></Button></TooltipTrigger><TooltipContent><p>Reverter para Sujeito ao DIFAL</p></TooltipContent></Tooltip>
                            )}
                        </TooltipProvider>
                    </div>
                )
            }
        });
        return baseCols;

    }, [items, onClassificationChange, competence, allClassifications]);


    if (items.length === 0) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Análise de Itens para DIFAL</CardTitle>
                </CardHeader>
                <CardContent className="text-muted-foreground text-center p-4">
                    Nenhum item foi marcado como "DIFAL" na aba de Validação de CFOP.
                </CardContent>
            </Card>
        );
    }
    
    const itemsByCfop = (data: any[]) => data.reduce((acc, item) => {
        const cfop = item.Sienge_CFOP || 'N/A';
        if (!acc[cfop]) acc[cfop] = [];
        acc[cfop].push(item);
        return acc;
    }, {} as Record<string, any[]>);

    const subjectByCfop = itemsByCfop(subject);
    const disregardedByCfop = itemsByCfop(disregarded);


    const RenderCfopTabs = ({dataByCfop}: {dataByCfop: Record<string, any[]>}) => {
        const cfops = Object.keys(dataByCfop);
        if (cfops.length === 0) return <p className="text-muted-foreground text-center p-4">Nenhum item nesta categoria.</p>;

        return (
             <Tabs defaultValue={cfops[0]} className="w-full">
                <TabsList>
                    {cfops.map(cfop => (
                        <TabsTrigger key={cfop} value={cfop}>CFOP {cfop} ({dataByCfop[cfop].length})</TabsTrigger>
                    ))}
                </TabsList>
                {cfops.map(cfop => (
                    <TabsContent key={cfop} value={cfop} className='mt-4'>
                        <DataTable columns={difalColumns} data={dataByCfop[cfop]} />
                    </TabsContent>
                ))}
            </Tabs>
        )
    };


    return (
         <Card>
            <CardHeader>
                <CardTitle>Análise de Itens para DIFAL</CardTitle>
                <CardDescription>Classifique os itens que foram pré-selecionados para análise de DIFAL.</CardDescription>
            </CardHeader>
            <CardContent>
                <Tabs defaultValue="subject">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="subject">Sujeito ao DIFAL ({subject.length})</TabsTrigger>
                        <TabsTrigger value="disregarded">Desconsiderados ({disregarded.length})</TabsTrigger>
                    </TabsList>
                    <TabsContent value="subject" className="mt-4">
                        <RenderCfopTabs dataByCfop={subjectByCfop} />
                    </TabsContent>
                    <TabsContent value="disregarded" className="mt-4">
                        <RenderCfopTabs dataByCfop={disregardedByCfop} />
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    )
}
