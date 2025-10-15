
"use client";

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Copy, Download, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { KeyCheckResult, KeyInfo, DateValueDivergence, IEUFDivergence, ConsolidatedDivergence } from "@/components/app/key-checker";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from "./data-table";
import { getColumns } from "@/lib/columns-helper";


const identifyInvoiceModel = (key: string): 'NFE' | 'CTE' | '?' => {
    if (!key || key.length !== 44 || !/^\d+$/.test(key.substring(20, 22))) return '?';
    const modelCode = key.substring(20, 22);
    if (modelCode === '55') return 'NFE';
    if (modelCode === '57') return 'CTE';
    return '?';
};

const extractInvoiceNumber = (key: string): string => {
    if (key && key.length === 44 && /^\d+$/.test(key.substring(25, 34))) return String(parseInt(key.substring(25, 34), 10));
    return "N/A";
};


interface KeyItemProps {
    keyInfo: KeyInfo;
    isDuplicate: boolean;
}


const KeyItem = ({ keyInfo, isDuplicate }: KeyItemProps) => {
    const { toast } = useToast();

    const copyToClipboard = (text: string, type: string) => {
        navigator.clipboard.writeText(text).then(() => {
            toast({ title: `${type} copiad${type.endsWith('a') ? 'a' : 'o'}`, description: text });
        }).catch(() => {
            toast({ variant: 'destructive', title: `Falha ao copiar ${type}` });
        });
    };
    
    const invoiceNumber = extractInvoiceNumber(keyInfo.key);
    
    const formattedDate = useMemo(() => {
        if (!keyInfo.Emissão) return 'N/A';
        try {
            const dateStr = String(keyInfo.Emissão).substring(0, 10); // YYYY-MM-DD
            const [year, month, day] = dateStr.split('-');
            if (!year || !month || !day) return 'Inválida';
            return `${day}/${month}/${year}`;
        } catch {
            return 'Inválida';
        }
    }, [keyInfo.Emissão]);

    const formattedValue = useMemo(() => {
        if (typeof keyInfo.Total !== 'number') return 'N/A';
        return keyInfo.Total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }, [keyInfo.Total]);
    
    return (
        <div className={`p-3 rounded-lg border flex flex-col gap-3 transition-colors bg-secondary/50`}>
            <div className="font-mono text-sm break-all">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-muted-foreground">Chave:</span>
                    <span>{keyInfo.key}</span>
                </div>
                 {isDuplicate && (
                    <div className="flex items-center gap-1 text-xs text-amber-700 font-semibold">
                        <AlertTriangle className="h-3 w-3" />
                        <span>Possível duplicidade</span>
                    </div>
                )}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                 <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-2 text-sm flex-grow">
                     <div className="text-muted-foreground">Fornecedor: {keyInfo.Fornecedor || 'N/A'}</div>
                    <div className="text-muted-foreground">Emissão: {formattedDate}</div>
                    <div className="text-muted-foreground">Valor: {formattedValue}</div>
                </div>
                 <div className="flex items-center gap-2">
                    <div className="text-sm font-mono flex items-center gap-2 bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded">
                        <span className="text-foreground">NF: {invoiceNumber}</span>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copyToClipboard(invoiceNumber, 'Número da NF')}>
                            <Copy className="h-4 w-4" />
                        </Button>
                    </div>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => copyToClipboard(keyInfo.key, 'Chave')}>
                        <Copy className="h-4 w-4" />
                    </Button>
                 </div>
            </div>
        </div>
    );
};

const handleDownload = (data: any[], listName: string, toast: (options: any) => void) => {
    if (!data || data.length === 0) {
        toast({
            variant: 'destructive',
            title: 'Nenhum dado para baixar',
            description: `Não há chaves na lista para o ficheiro ${listName}.`
        });
        return;
    }
    const worksheet = XLSX.utils.json_to_sheet(data);
    const colWidths = Object.keys(data[0] || {}).map(key => ({ wch: Math.max(key.length, 20) }));
    worksheet['!cols'] = colWidths;
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Dados");
    const fileName = `Grantel - ${listName}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    toast({ title: "Download Iniciado", description: `O ficheiro ${fileName} está a ser descarregado.` });
};


const KeyDisplayList = ({ keys, duplicateKeys, listName }: { 
    keys: KeyInfo[]; 
    duplicateKeys: Set<string>; 
    listName: string; 
}) => {
    const { toast } = useToast();

    const downloadCurrentList = () => {
         const dataToDownload = keys.map(k => {
            let formattedDate = '';
            if (k.Emissão) {
                try {
                    const dateStr = String(k.Emissão).substring(0, 10);
                    const [year, month, day] = dateStr.split('-');
                    if (year && month && day) {
                        formattedDate = `${day}/${month}/${year}`;
                    }
                } catch {}
            }
            return {
                "Chave de acesso": k.key,
                "Modelo": identifyInvoiceModel(k.key),
                "Número da Nota": extractInvoiceNumber(k.key),
                "Tipo": k.type,
                "Fornecedor/Destinatário": k.Fornecedor,
                "Data Emissão": formattedDate,
                "Valor Total": k.Total,
            };
        });
        handleDownload(dataToDownload, listName, toast);
    }

    if (!keys || keys.length === 0) {
        return <p className="text-muted-foreground italic text-center p-4">Nenhuma chave para exibir nesta categoria.</p>;
    }
    return (
        <div className="space-y-4">
             <Button onClick={downloadCurrentList} disabled={keys.length === 0} size="sm">
                <Download className="mr-2 h-4 w-4" />
                Baixar esta aba
            </Button>
            <div className="space-y-2">
                {keys.map((keyInfo, index) => (
                    <KeyItem 
                        key={`${keyInfo.key}-${index}`} 
                        keyInfo={keyInfo} 
                        isDuplicate={duplicateKeys.has(keyInfo.key)} 
                    />
                ))}
            </div>
        </div>
    );
};


interface KeyResultsDisplayProps {
    results: KeyCheckResult | null;
}

export function KeyResultsDisplay({ results }: KeyResultsDisplayProps) {
    const { toast } = useToast();
    
    if (!results) {
        return null;
    }
    
    const duplicateSheetKeys = new Set(results.duplicateKeysInSheet || []);
    const duplicateTxtKeys = new Set(results.duplicateKeysInTxt || []);
    
    const {
        notFoundNfe, notFoundCte,
        inTxtNotInSheetNfe, inTxtNotInSheetCte,
        validNfe, validCte,
    } = useMemo(() => {
        const categorize = (keys: KeyInfo[] | undefined) => {
            const nfe: KeyInfo[] = [];
            const cte: KeyInfo[] = [];
            if (!keys) return { nfe, cte }; 

            keys.forEach(k => {
                if (!k || !k.key) return; 
                const model = identifyInvoiceModel(k.key);
                if (model === 'NFE' || k.type?.toUpperCase() === 'NFE' || k.type?.toUpperCase() === 'SAÍDA') {
                    nfe.push(k);
                } else if (model === 'CTE' || k.type?.toUpperCase() === 'CTE') {
                    cte.push(k);
                } else {
                    nfe.push(k);
                }
            });
            return { nfe, cte };
        };
        
        const notFound = categorize(results.keysNotFoundInTxt);
        const inTxt = categorize(results.keysInTxtNotInSheet);
        const valid = categorize(results.validKeys);

        return {
            notFoundNfe: notFound.nfe,
            notFoundCte: notFound.cte,
            inTxtNotInSheetNfe: inTxt.nfe,
            inTxtNotInSheetCte: inTxt.cte,
            validNfe: valid.nfe,
            validCte: valid.cte,
        };
    }, [results]);


    return (
        <Tabs defaultValue="not-in-sped" className="w-full mt-4">
            <TabsList className="grid w-full grid-cols-1 md:grid-cols-4">
                <TabsTrigger value="not-in-sped" className="text-red-600">Não Encontrado no SPED</TabsTrigger>
                <TabsTrigger value="not-in-sheet" className="text-blue-600">Não Encontrado na Planilha</TabsTrigger>
                <TabsTrigger value="valid" className="text-green-600">Válido em Ambos</TabsTrigger>
                <TabsTrigger value="divergences" className="text-orange-600">Inconformidades</TabsTrigger>
            </TabsList>

            {/* Aba: Não Encontrado no SPED */}
            <TabsContent value="not-in-sped" className="mt-6">
                <Card className="shadow-lg border-red-500/50">
                    <CardHeader>
                        <CardTitle className="font-headline text-2xl text-red-700 dark:text-red-500">Chaves da Planilha NÃO ENCONTRADAS no SPED</CardTitle>
                        <CardDescription>Estas chaves estavam na sua planilha mas não no arquivo .txt.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Tabs defaultValue="nfe" className="w-full">
                            <TabsList>
                                <TabsTrigger value="nfe">NFe ({notFoundNfe.length})</TabsTrigger>
                                <TabsTrigger value="cte">CTe ({notFoundCte.length})</TabsTrigger>
                            </TabsList>
                            <TabsContent value="nfe" className="pt-4">
                                <KeyDisplayList keys={notFoundNfe} duplicateKeys={duplicateSheetKeys} listName="NFe_Nao_Encontradas_SPED" />
                            </TabsContent>
                             <TabsContent value="cte" className="pt-4">
                                <KeyDisplayList keys={notFoundCte} duplicateKeys={duplicateSheetKeys} listName="CTe_Nao_Encontrados_SPED" />
                            </TabsContent>
                        </Tabs>
                    </CardContent>
                </Card>
            </TabsContent>

             {/* Aba: Não Encontrado na Planilha */}
            <TabsContent value="not-in-sheet" className="mt-6">
                 <Card className="shadow-lg border-blue-500/50">
                    <CardHeader>
                        <CardTitle className="font-headline text-2xl text-blue-700 dark:text-blue-500">Chaves do SPED NÃO ENCONTRADAS na Planilha</CardTitle>
                        <CardDescription>Estas chaves estavam no seu arquivo .txt mas não na planilha.</CardDescription>
                    </CardHeader>
                    <CardContent>
                         <Tabs defaultValue="nfe" className="w-full">
                            <TabsList>
                                <TabsTrigger value="nfe">NFe ({inTxtNotInSheetNfe.length})</TabsTrigger>
                                <TabsTrigger value="cte">CTe ({inTxtNotInSheetCte.length})</TabsTrigger>
                            </TabsList>
                             <TabsContent value="nfe" className="pt-4">
                                <KeyDisplayList keys={inTxtNotInSheetNfe} duplicateKeys={duplicateTxtKeys} listName="NFe_SPED_Nao_na_Planilha" />
                            </TabsContent>
                            <TabsContent value="cte" className="pt-4">
                                <KeyDisplayList keys={inTxtNotInSheetCte} duplicateKeys={duplicateTxtKeys} listName="CTe_SPED_Nao_na_Planilha" />
                            </TabsContent>
                        </Tabs>
                    </CardContent>
                </Card>
            </TabsContent>

             {/* Aba: Válido em Ambos */}
            <TabsContent value="valid" className="mt-6">
                <Card className="shadow-lg border-green-500/50">
                    <CardHeader>
                        <CardTitle className="font-headline text-2xl text-green-700 dark:text-green-500">Chaves Válidas (Encontradas em Ambos)</CardTitle>
                        <CardDescription>Estas chaves foram encontradas com sucesso na planilha e no arquivo SPED.</CardDescription>
                    </CardHeader>
                     <CardContent>
                         <Tabs defaultValue="nfe" className="w-full">
                            <TabsList>
                                <TabsTrigger value="nfe">NFe ({validNfe.length})</TabsTrigger>
                                <TabsTrigger value="cte">CTe ({validCte.length})</TabsTrigger>
                            </TabsList>
                            <TabsContent value="nfe" className="pt-4">
                                <KeyDisplayList keys={validNfe} duplicateKeys={new Set()} listName="NFe_Validas" />
                            </TabsContent>
                             <TabsContent value="cte" className="pt-4">
                                <KeyDisplayList keys={validCte} duplicateKeys={new Set()} listName="CTe_Validos" />
                            </TabsContent>
                        </Tabs>
                    </CardContent>
                </Card>
            </TabsContent>
            
            {/* Aba: Divergências */}
            <TabsContent value="divergences" className="mt-6">
                <Card className="shadow-lg border-orange-500/50">
                     <CardHeader>
                        <CardTitle className="font-headline text-2xl text-orange-700 dark:text-orange-500">Inconformidades e Divergências</CardTitle>
                        <CardDescription>Alertas sobre divergências de data, valor e cadastro (UF/IE) entre XML e SPED.</CardDescription>
                    </CardHeader>
                    <CardContent>
                         <Tabs defaultValue="consolidated" className="w-full">
                             <TabsList className="grid w-full grid-cols-5">
                                <TabsTrigger value="consolidated">Consolidado ({results.consolidatedDivergences.length})</TabsTrigger>
                                <TabsTrigger value="uf-divergence">UF ({results.ufDivergences.length})</TabsTrigger>
                                <TabsTrigger value="ie-divergence">IE ({results.ieDivergences.length})</TabsTrigger>
                                <TabsTrigger value="data">Data ({results.dateDivergences.length})</TabsTrigger>
                                <TabsTrigger value="valor">Valor ({results.valueDivergences.length})</TabsTrigger>
                            </TabsList>
                            
                            <TabsContent value="consolidated" className="pt-4">
                                <Button onClick={() => handleDownload(results.consolidatedDivergences, "Inconformidades_Consolidado", toast)} disabled={results.consolidatedDivergences.length === 0} size="sm" className="mb-4">
                                    <Download className="mr-2 h-4 w-4" /> Baixar esta lista
                                </Button>
                                <DataTable columns={getColumns(results.consolidatedDivergences)} data={results.consolidatedDivergences} />
                            </TabsContent>

                            <TabsContent value="uf-divergence" className="pt-4">
                                <Button onClick={() => handleDownload(results.ufDivergences, "Inconformidades_Cadastrais_UF", toast)} disabled={results.ufDivergences.length === 0} size="sm" className="mb-4">
                                    <Download className="mr-2 h-4 w-4" /> Baixar esta lista
                                </Button>
                                <DataTable columns={getColumns(results.ufDivergences)} data={results.ufDivergences} />
                            </TabsContent>
                             <TabsContent value="ie-divergence" className="pt-4">
                                <Button onClick={() => handleDownload(results.ieDivergences, "Inconformidades_Cadastrais_IE", toast)} disabled={results.ieDivergences.length === 0} size="sm" className="mb-4">
                                    <Download className="mr-2 h-4 w-4" /> Baixar esta lista
                                </Button>
                                <DataTable columns={getColumns(results.ieDivergences)} data={results.ieDivergences} />
                            </TabsContent>
                            <TabsContent value="data" className="pt-4">
                                <Button onClick={() => handleDownload(results.dateDivergences, "Divergencias_Data", toast)} disabled={results.dateDivergences.length === 0} size="sm" className="mb-4">
                                    <Download className="mr-2 h-4 w-4" /> Baixar
                                </Button>
                                 <DataTable columns={getColumns(results.dateDivergences)} data={results.dateDivergences} />
                            </TabsContent>
                             <TabsContent value="valor" className="pt-4">
                                <Button onClick={() => handleDownload(results.valueDivergences, "Divergencias_Valor", toast)} disabled={results.valueDivergences.length === 0} size="sm" className="mb-4">
                                    <Download className="mr-2 h-4 w-4" /> Baixar
                                </Button>
                                 <DataTable columns={getColumns(results.valueDivergences)} data={results.valueDivergences} />
                            </TabsContent>
                         </Tabs>
                    </CardContent>
                </Card>
            </TabsContent>
        </Tabs>
    );
}
