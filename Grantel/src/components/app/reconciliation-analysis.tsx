"use client";

import React, { useMemo, useState, ChangeEvent } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ProcessedData } from '@/lib/excel-processor';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { GitCompareArrows, AlertTriangle, Download, FileSearch, Loader2, Cpu } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from "@/components/app/data-table";
import { getColumns, getColumnsForDivergentTabs } from "@/lib/columns-helper";
import { SiengeTaxCheck } from './sienge-tax-check';
import { CfopValidator } from './cfop-validator';
import type { AllClassifications } from '@/lib/types';
import { FileUploadForm } from './file-upload-form';
import * as XLSX from 'xlsx';
import { CostCenterAnalysis } from './cost-center-analysis';


interface ReconciliationAnalysisProps {
    processedData: ProcessedData | null;
    initialXmlItems: any[];
    siengeFile: File | null;
    onSiengeFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onClearSiengeFile: () => void;
    costCenterFile: File | null;
    onCostCenterFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onClearCostCenterFile: () => void;
    
    payableAccountingFiles: File[];
    onPayableAccountingFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onClearPayableAccountingFile: () => void;
    
    paidAccountingFiles: File[];
    onPaidAccountingFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onClearPaidAccountingFile: () => void;

    onRunReconciliation: () => Promise<void>;

    allClassifications: AllClassifications;
    onPersistClassifications: (allData: AllClassifications) => void;
    competence: string | null;
}


export function ReconciliationAnalysis({ 
    processedData, 
    initialXmlItems,
    siengeFile, 
    onSiengeFileChange, 
    onClearSiengeFile,
    costCenterFile,
    onCostCenterFileChange,
    onClearCostCenterFile,
    payableAccountingFiles,
    onPayableAccountingFileChange,
    onClearPayableAccountingFile,
    paidAccountingFiles,
    onPaidAccountingFileChange,
    onClearPaidAccountingFile,
    onRunReconciliation,
    allClassifications,
    onPersistClassifications,
    competence,
}: ReconciliationAnalysisProps) {
    const { toast } = useToast();
    const [isReconciliationRunning, setIsReconciliationRunning] = useState(false);
    
    const handleRunReconciliation = async () => {
        setIsReconciliationRunning(true);
        await onRunReconciliation();
        setIsReconciliationRunning(false);
    };

    const reconciliationResults = processedData?.reconciliationResults;
    const siengeDataForTaxCheck = processedData?.siengeSheetData;
    const devolucoesEP = processedData?.reconciliationResults?.devolucoesEP;
    const itensValidosSaidas = processedData?.sheets?.['Itens Válidos Saídas'] || [];

    const handleDownload = async (data: any[], title: string) => {
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
    
    // This logic ensures we always have something to show in the "Apenas no XML" tab.
    // If reconciliation has run, we use its results. If not, we use the initial items passed down.
    const itemsToShowInOnlyXmlTab = useMemo(() => {
        return reconciliationResults?.onlyInXml ?? initialXmlItems ?? [];
    }, [reconciliationResults, initialXmlItems]);


    return (
         <Card>
            <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <GitCompareArrows className="h-8 w-8 text-primary" />
                        <div>
                            <CardTitle className="font-headline text-2xl">XML VS Sienge</CardTitle>
                            <CardDescription>Carregue as planilhas Sienge, Contabilização e de Centro de Custo para cruzar informações com os XMLs processados.</CardDescription>
                        </div>
                    </div>
                     <Button onClick={handleRunReconciliation} disabled={isReconciliationRunning || !siengeFile}>
                        {isReconciliationRunning ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/>A Conciliar...</> : <><Cpu className="mr-2 h-4 w-4"/>Executar Conciliação</>}
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
                 <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-start'>
                    <div className='space-y-2'>
                        <h3 className='font-medium'>Planilha do Sienge</h3>
                        <FileUploadForm
                            displayName="Itens do Sienge"
                            formId="sienge-for-reconciliation"
                            files={{ 'sienge-for-reconciliation': !!siengeFile }}
                            onFileChange={onSiengeFileChange}
                            onClearFile={onClearSiengeFile}
                        />
                         <Button onClick={() => handleDownload(processedData?.siengeDebugKeys || [], 'Depuracao_Sienge')} size="sm" variant="outline" disabled={!processedData?.siengeDebugKeys || processedData.siengeDebugKeys.length === 0}><Download className='h-4 w-4 mr-2' />Baixar Chaves de Depuração</Button>
                    </div>
                    <CostCenterAnalysis
                        costCenterFile={costCenterFile}
                        onCostCenterFileChange={onCostCenterFileChange}
                        onClearCostCenterFile={onClearCostCenterFile}
                        processedData={processedData}
                        onDownloadDebug={() => handleDownload(processedData?.costCenterDebugKeys || [], 'Depuracao_CentroCusto')}
                    />
                    <div className='space-y-2'>
                         <h3 className='font-medium'>Contas a Pagar</h3>
                         <FileUploadForm
                            displayName="Contas a Pagar"
                            formId="payable-accounting"
                            files={{ 'payable-accounting': payableAccountingFiles.length > 0 }}
                            onFileChange={onPayableAccountingFileChange}
                            onClearFile={onClearPayableAccountingFile}
                            multiple={true}
                            fileCount={payableAccountingFiles.length}
                        />
                         <Button onClick={() => handleDownload(processedData?.payableAccountingDebugKeys || [], 'Depuracao_Contas_Pagar')} size="sm" variant="outline" disabled={!processedData?.payableAccountingDebugKeys || processedData.payableAccountingDebugKeys.length === 0}><Download className='h-4 w-4 mr-2' />Baixar Chaves de Depuração</Button>
                    </div>
                     <div className='space-y-2'>
                         <h3 className='font-medium'>Contas Pagas</h3>
                         <FileUploadForm
                            displayName="Contas Pagas"
                            formId="paid-accounting"
                            files={{ 'paid-accounting': paidAccountingFiles.length > 0 }}
                            onFileChange={onPaidAccountingFileChange}
                            onClearFile={onClearPaidAccountingFile}
                            multiple={true}
                            fileCount={paidAccountingFiles.length}
                        />
                         <Button onClick={() => handleDownload(processedData?.paidAccountingDebugKeys || [], 'Depuracao_Contas_Pagas')} size="sm" variant="outline" disabled={!processedData?.paidAccountingDebugKeys || processedData.paidAccountingDebugKeys.length === 0}><Download className='h-4 w-4 mr-2' />Baixar Chaves de Depuração</Button>
                    </div>
                </div>
                
                <Tabs defaultValue="reconciliation">
                    <TabsList className="grid w-full grid-cols-4">
                        <TabsTrigger value="reconciliation">Conciliação de Itens</TabsTrigger>
                        <TabsTrigger value="devolucoes-ep" disabled={!devolucoesEP || devolucoesEP.length === 0}>
                            Devoluções - EP
                        </TabsTrigger>
                        <TabsTrigger value="tax_check" disabled={!siengeDataForTaxCheck}>Conferência de Impostos</TabsTrigger>
                        <TabsTrigger value="cfop_validation">Validação CFOP</TabsTrigger>
                    </TabsList>
                    <TabsContent value="reconciliation" className="mt-4">
                         {!initialXmlItems || initialXmlItems.length === 0 && (
                             <Alert variant="destructive">
                                <AlertTriangle className="h-4 w-4" />
                                <AlertTitle>Dados XML em falta</AlertTitle>
                                <AlertDescription>
                                    Processe os XMLs na primeira aba para habilitar a conciliação.
                                </AlertDescription>
                            </Alert>
                        )}
                        <div className="mt-6">
                            <Tabs defaultValue="reconciled">
                                <TabsList className="grid w-full grid-cols-4">
                                    <TabsTrigger value="reconciled">Conciliados ({reconciliationResults?.reconciled.length || 0})</TabsTrigger>
                                    <TabsTrigger value="onlyInSienge">Apenas no Sienge ({reconciliationResults?.onlyInSienge.length || 0})</TabsTrigger>
                                    <TabsTrigger value="onlyInXml">Apenas no XML ({itemsToShowInOnlyXmlTab.length || 0})</TabsTrigger>
                                    <TabsTrigger value="otherSiengeItems">Outros Lançamentos Sienge</TabsTrigger>
                                </TabsList>
                                <div className="mt-4">
                                    <TabsContent value="reconciled">
                                        <Button onClick={() => handleDownload(reconciliationResults?.reconciled || [], 'Itens_Conciliados')} size="sm" className="mb-4" disabled={!reconciliationResults || reconciliationResults.reconciled.length === 0}><Download className="mr-2 h-4 w-4"/> Baixar</Button>
                                        <DataTable columns={getColumns(reconciliationResults?.reconciled || [], ['Fornecedor', 'Número da Nota', 'Descrição', 'Valor Total', 'CFOP', 'CFOP (Sienge)', 'Centro de Custo', 'Contabilização', 'Observações'])} data={reconciliationResults?.reconciled || []} />
                                    </TabsContent>
                                    <TabsContent value="onlyInSienge">
                                        <Button onClick={() => handleDownload(reconciliationResults?.onlyInSienge || [], 'Itens_Apenas_Sienge')} size="sm" className="mb-4" disabled={!reconciliationResults || reconciliationResults.onlyInSienge.length === 0}><Download className="mr-2 h-4 w-4"/> Baixar</Button>
                                        <DataTable columns={getColumnsForDivergentTabs(reconciliationResults?.onlyInSienge || [])} data={reconciliationResults?.onlyInSienge || []} />
                                    </TabsContent>
                                    <TabsContent value="onlyInXml">
                                        <Button onClick={() => handleDownload(itemsToShowInOnlyXmlTab, 'Itens_Apenas_XML')} size="sm" className="mb-4" disabled={itemsToShowInOnlyXmlTab.length === 0}><Download className="mr-2 h-4 w-4"/> Baixar</Button>
                                        <DataTable columns={getColumnsForDivergentTabs(itemsToShowInOnlyXmlTab)} data={itemsToShowInOnlyXmlTab} />
                                    </TabsContent>
                                    <TabsContent value="otherSiengeItems">
                                         <Tabs defaultValue={Object.keys(reconciliationResults?.otherSiengeItems || {})[0]} className="w-full">
                                            <TabsList>
                                                {Object.entries(reconciliationResults?.otherSiengeItems || {}).map(([esp, items]) => (
                                                    <TabsTrigger key={esp} value={esp}>{esp} ({items.length})</TabsTrigger>
                                                ))}
                                            </TabsList>
                                            {Object.entries(reconciliationResults?.otherSiengeItems || {}).map(([esp, items]) => (
                                                <TabsContent key={esp} value={esp} className='mt-4'>
                                                     <Button onClick={() => handleDownload(items, `Outros_Sienge_${esp}`)} size="sm" className="mb-4" disabled={items.length === 0}><Download className="mr-2 h-4 w-4"/> Baixar</Button>
                                                     <DataTable columns={getColumns(items, ['Credor', 'Documento', 'Data Emissão', 'Valor', 'Observações', 'Centro de Custo', 'Contabilização'])} data={items} />
                                                </TabsContent>
                                            ))}
                                        </Tabs>
                                    </TabsContent>
                                </div>
                            </Tabs>
                        </div>
                    </TabsContent>
                     <TabsContent value="devolucoes-ep" className="mt-4">
                        {devolucoesEP && devolucoesEP.length > 0 ? (
                           <div>
                                <Button onClick={() => handleDownload(devolucoesEP, 'Devolucoes_EP')} size="sm" className="mb-4"><Download className="mr-2 h-4 w-4"/> Baixar</Button>
                                <DataTable columns={getColumns(devolucoesEP)} data={devolucoesEP} />
                           </div>
                        ) : (
                             <div className="flex flex-col items-center justify-center min-h-[300px] text-muted-foreground border-2 border-dashed rounded-lg p-8">
                                <FileSearch className="h-12 w-12 text-primary" />
                                <p className="mt-4 text-center">Nenhuma devolução de emissão própria foi encontrada ou a conciliação ainda não foi executada.</p>
                            </div>
                        )}
                    </TabsContent>
                    
                    <TabsContent value="tax_check" className="mt-4">
                        <SiengeTaxCheck siengeData={siengeDataForTaxCheck} />
                    </TabsContent>
                    
                    <TabsContent value="cfop_validation" className="mt-4">
                        <CfopValidator 
                            items={reconciliationResults?.reconciled || []}
                            nfeValidasData={processedData?.sheets?.['Notas Válidas'] || []}
                            originalXmlItems={processedData?.sheets?.['Original - Itens'] || []}
                            itensSaidas={itensValidosSaidas}
                            allPersistedData={allClassifications}
                            onPersistData={onPersistClassifications}
                            competence={competence}
                        />
                    </TabsContent>
                </Tabs>
            </CardContent>
         </Card>
    );
}
