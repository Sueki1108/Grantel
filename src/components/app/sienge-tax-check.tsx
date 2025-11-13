"use client";

import * as React from 'react';
import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Download } from "lucide-react";
import * as XLSX from 'xlsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from "@/components/app/data-table";
import { getColumns, getColumnsWithCustomRender } from "@/components/app/columns-helper";
import { cfopDescriptions } from "@/lib/cfop";
import { cleanAndToStr } from "@/lib/utils";
import { Button } from '@/components/ui/button';

type InconsistentRow = { 
    row: any; 
    originalIndex: number 
};

const inconsistentCfopColumns = ["Número", "Credor", "CPF/CNPJ", "CFOP", "Descricao CFOP", "UF do Fornecedor", "Correção Sugerida"];

const formatCurrency = (value: any) => {
    const num = parseFloat(String(value).replace(',', '.'));
    if (isNaN(num)) return String(value ?? '');
    return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const normalizeKey = (key: string | undefined): string => {
    if(!key) return '';
    return key.toLowerCase().replace(/[\s-._/]/g, '');
}

export function SiengeTaxCheck({siengeData}: {siengeData: any[] | null}) {
    
    const { toast } = useToast();

    const taxAndReconciliationAnalyses = useMemo(() => {
        if (!siengeData || siengeData.length === 0) {
            return { inconsistentCfopRows: [], taxConferences: { icms: [], pis: [], cofins: [], ipi: [], icmsSt: [] } };
        }
    
        const findHeader = (data: any[], possibleNames: string[]): string | undefined => {
             if (!data || data.length === 0 || !data[0]) return undefined;
             const headers = Object.keys(data[0]);
             const normalizedHeaders = headers.map(h => ({ original: h, normalized: normalizeKey(h) }));
             for (const name of possibleNames) {
                 const normalizedName = normalizeKey(name);
                 const found = normalizedHeaders.find(h => h.normalized === normalizedName);
                 if (found) return found.original;
             }
             return undefined;
        };
    
        const h = {
            uf: findHeader(siengeData, ['uf', 'uf do fornecedor']), 
            cfop: findHeader(siengeData, ['cfop']),
            icms: findHeader(siengeData, ['icms', 'valor icms', 'vlr icms']), 
            pis: findHeader(siengeData, ['pis', 'valor pis', 'vlr pis']),
            cofins: findHeader(siengeData, ['cofins', 'valor cofins', 'vlr cofins']), 
            ipi: findHeader(siengeData, ['ipi', 'valor ipi', 'vlr ipi']),
            icmsSt: findHeader(siengeData, ['icms-st', 'icms st', 'valor icms st', 'vlr icms st', 'vlr icms subst']),
            numero: findHeader(siengeData, ['número', 'numero', 'numero da nota', 'nota fiscal']), 
            fornecedor: findHeader(siengeData, ['credor', 'fornecedor', 'nome do fornecedor']),
            cpfCnpj: findHeader(siengeData, ['cpf/cnpj', 'cpf/cnpj do fornecedor']),
            descricao: findHeader(siengeData, ['descrição', 'descrição do item', 'produto fiscal']),
        };

        const cfopRows: InconsistentRow[] = [];
        const icms: any[] = [], pis: any[] = [], cofins: any[] = [], ipi: any[] = [], icmsSt: any[] = [];
        
        const getTaxFooter = (data: any[], taxName: string): Record<string, string> | undefined => {
            if (!data || data.length === 0) return undefined;
            const total = data.reduce((sum, row) => {
                const value = parseFloat(String(row?.[taxName] || '0').replace(',', '.'));
                return sum + (isNaN(value) ? 0 : value);
            }, 0);
            return { [taxName]: formatCurrency(total) };
        }
    
        const getCfopDescription = (cfopCode: number): string => {
            const fullDescription = cfopDescriptions[cfopCode];
            if (fullDescription) {
                 const nestedDescriptionKey = Object.keys(cfopDescriptions).find(k => cfopDescriptions[Number(k) as keyof typeof cfopDescriptions] === fullDescription);
                if (nestedDescriptionKey) {
                    const nestedDescription = cfopDescriptions[Number(nestedDescriptionKey) as keyof typeof cfopDescriptions];
                    if (nestedDescription && typeof nestedDescription === 'string') {
                         return nestedDescription.split(' ').slice(0, 3).join(' ');
                    }
                }
                return fullDescription.split(' ').slice(0, 3).join(' ');
            }
            return 'N/A';
        };
    
        const getRelevantData = (row: any, taxKey: string | undefined, taxName: string) => {
            if (!taxKey || !row || typeof row !== 'object' || !h.cfop) return null;
            const relevantRow: Record<string, any> = {};
            if(h.numero && h.numero in row) relevantRow["Número"] = row[h.numero];
            if(h.cpfCnpj && h.cpfCnpj in row) relevantRow["CPF/CNPJ"] = row[h.cpfCnpj];
            if(h.fornecedor && h.fornecedor in row) relevantRow["Credor"] = row[h.fornecedor];
            const cfopVal = row[h.cfop] ?? row['CFOP'];
            const cfopCode = parseInt(cleanAndToStr(cfopVal), 10);
            relevantRow["CFOP"] = cfopCode;
            relevantRow["Descricao CFOP"] = getCfopDescription(cfopCode);
            if(taxKey in row) relevantRow[taxName] = row[taxKey];
            if(h.descricao && h.descricao in row) relevantRow["Descrição"] = row[h.descricao];
            return relevantRow;
        }
    
        siengeData.forEach((row, index) => {
            if (!row || typeof row !== 'object') return;
    
            if (h.uf && row[h.uf] && h.cfop) {
                const cfopVal = row[h.cfop] ?? row['CFOP'];
                if(cfopVal) {
                    const uf = String(row[h.uf] || '').toUpperCase().trim();
                    const cfop = String(cfopVal || '').trim();
                    if (uf && cfop) {
                        const isInterstate = uf !== 'PR';
                        const firstDigit = cfop.charAt(0);
                        const cfopCode = parseInt(cfop, 10);
                        const baseRow = {
                            "Número": (h.numero && row[h.numero]) || '', 
                            "Credor": (h.fornecedor && row[h.fornecedor]) || '', 
                            "CPF/CNPJ": (h.cpfCnpj && row[h.cpfCnpj]) || '',
                            "CFOP": cfop,
                            "Descricao CFOP": getCfopDescription(cfopCode),
                            "UF do Fornecedor": uf,
                        };
                        if (isInterstate && firstDigit !== '2' && !['5', '6', '7'].includes(firstDigit)) {
                            cfopRows.push({ row: { ...baseRow, "Correção Sugerida": `2${cfop.substring(1)}` }, originalIndex: index });
                        } else if (!isInterstate && firstDigit !== '1' && !['5', '6', '7'].includes(firstDigit)) {
                             cfopRows.push({ row: { ...baseRow, "Correção Sugerida": `1${cfop.substring(1)}` }, originalIndex: index });
                        }
                    }
                }
            }
    
            if (h.icms && parseFloat(String(row[h.icms] || '0').replace(',', '.')) > 0) icms.push(getRelevantData(row, h.icms, "Valor ICMS")!);
            if (h.pis && parseFloat(String(row[h.pis] || '0').replace(',', '.')) > 0) pis.push(getRelevantData(row, h.pis, "Valor PIS")!);
            if (h.cofins && parseFloat(String(row[h.cofins] || '0').replace(',', '.')) > 0) cofins.push(getRelevantData(row, h.cofins, "Valor COFINS")!);
            if (h.ipi && parseFloat(String(row[h.ipi] || '0').replace(',', '.')) > 0) ipi.push(getRelevantData(row, h.ipi, "Valor IPI")!);
            if (h.icmsSt && parseFloat(String(row[h.icmsSt] || '0').replace(',', '.')) > 0) icmsSt.push(getRelevantData(row, h.icmsSt, "Valor ICMS ST")!);
        });
        
        const uniqueCfopRowsMap = new Map<string, InconsistentRow>();
        cfopRows.forEach(item => {
            const numero = item.row['Número'];
            const cnpj = item.row['CPF/CNPJ'];
            if (numero && cnpj) {
                const key = `${cleanAndToStr(numero)}-${cleanAndToStr(cnpj)}`;
                if (!uniqueCfopRowsMap.has(key)) {
                    uniqueCfopRowsMap.set(key, item);
                }
            }
        });
    
        return { inconsistentCfopRows: Array.from(uniqueCfopRowsMap.values()), taxConferences: { icms, pis, cofins, ipi, icmsSt } };
    }, [siengeData]);

    const handleDownloadConferencia = (data: any[], title: string) => {
        if (!data || data.length === 0) {
            toast({ title: "Nenhum dado para exportar", description: `Não há itens na aba "${title}".` });
            return;
        }
        const dataToExport = data.map(item => item.row || item);
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, title);
        const fileName = `Grantel - Conferência ${title}.xlsx`;
        XLSX.writeFile(workbook, fileName);
    };

    const getTaxFooter = (data: any[], taxName: string): Record<string, string> | undefined => {
        if (!data || data.length === 0) return undefined;
        const total = data.reduce((sum, row) => {
            const value = parseFloat(String(row?.[taxName] || '0').replace(',', '.'));
            return sum + (isNaN(value) ? 0 : value);
        }, 0);
        return { [taxName]: formatCurrency(total) };
    }

    if (!siengeData) {
        return (
             <Card>
                <CardHeader>
                    <CardTitle>Conferência de Impostos (Sienge)</CardTitle>
                </CardHeader>
                <CardContent className="p-8 text-center text-muted-foreground">
                    <AlertTriangle className="mx-auto h-12 w-12 mb-4" />
                    <h3 className="text-xl font-semibold mb-2">Nenhum dado para analisar</h3>
                    <p>Carregue a planilha "Itens do Sienge" para iniciar a análise.</p>
                </CardContent>
             </Card>
        )
    }

    return (
        <Card>
             <CardHeader>
                <CardTitle>Resultados da Conferência de Impostos</CardTitle>
                <CardDescription>Listagem de todos os itens da planilha Sienge que possuem valores nos campos de impostos.</CardDescription>
            </CardHeader>
            <CardContent>
                <Tabs defaultValue="cfop_uf">
                    <TabsList className="h-auto flex-wrap justify-start">
                        <TabsTrigger value="cfop_uf">CFOP/UF ({taxAndReconciliationAnalyses.inconsistentCfopRows.length})</TabsTrigger>
                        <TabsTrigger value="icms">ICMS ({taxAndReconciliationAnalyses.taxConferences.icms.length})</TabsTrigger>
                        <TabsTrigger value="pis">PIS ({taxAndReconciliationAnalyses.taxConferences.pis.length})</TabsTrigger>
                        <TabsTrigger value="cofins">COFINS ({taxAndReconciliationAnalyses.taxConferences.cofins.length})</TabsTrigger>
                        <TabsTrigger value="ipi">IPI ({taxAndReconciliationAnalyses.taxConferences.ipi.length})</TabsTrigger>
                        <TabsTrigger value="icms_st">ICMS ST ({taxAndReconciliationAnalyses.taxConferences.icmsSt.length})</TabsTrigger>
                    </TabsList>
                    <TabsContent value="cfop_uf" className="mt-4">
                        <Button onClick={() => handleDownloadConferencia(taxAndReconciliationAnalyses.inconsistentCfopRows.map(r => r.row), 'CFOP_UF_Inconsistencias')} size="sm" className="mb-4" disabled={taxAndReconciliationAnalyses.inconsistentCfopRows.length === 0}><Download className="mr-2 h-4 w-4" /> Baixar Inconsistências</Button>
                        <DataTable columns={getColumnsWithCustomRender(taxAndReconciliationAnalyses.inconsistentCfopRows.map(r => r.row), inconsistentCfopColumns)} data={taxAndReconciliationAnalyses.inconsistentCfopRows.map(r => r.row)} />
                    </TabsContent>
                    <TabsContent value="icms" className="mt-4">
                        <Button onClick={() => handleDownloadConferencia(taxAndReconciliationAnalyses.taxConferences.icms, 'ICMS')} size="sm" className="mb-4" disabled={taxAndReconciliationAnalyses.taxConferences.icms.length === 0}><Download className="mr-2 h-4 w-4" /> Baixar</Button>
                        <DataTable columns={getColumns(taxAndReconciliationAnalyses.taxConferences.icms)} data={taxAndReconciliationAnalyses.taxConferences.icms} footer={getTaxFooter(taxAndReconciliationAnalyses.taxConferences.icms, 'Valor ICMS')} />
                    </TabsContent>
                    <TabsContent value="pis" className="mt-4">
                        <Button onClick={() => handleDownloadConferencia(taxAndReconciliationAnalyses.taxConferences.pis, 'PIS')} size="sm" className="mb-4" disabled={taxAndReconciliationAnalyses.taxConferences.pis.length === 0}><Download className="mr-2 h-4 w-4" /> Baixar</Button>
                        <DataTable columns={getColumns(taxAndReconciliationAnalyses.taxConferences.pis)} data={taxAndReconciliationAnalyses.taxConferences.pis} footer={getTaxFooter(taxAndReconciliationAnalyses.taxConferences.pis, 'Valor PIS')} />
                    </TabsContent>
                    <TabsContent value="cofins" className="mt-4">
                        <Button onClick={() => handleDownloadConferencia(taxAndReconciliationAnalyses.taxConferences.cofins, 'COFINS')} size="sm" className="mb-4" disabled={taxAndReconciliationAnalyses.taxConferences.cofins.length === 0}><Download className="mr-2 h-4 w-4" /> Baixar</Button>
                        <DataTable columns={getColumns(taxAndReconciliationAnalyses.taxConferences.cofins)} data={taxAndReconciliationAnalyses.taxConferences.cofins} footer={getTaxFooter(taxAndReconciliationAnalyses.taxConferences.cofins, 'Valor COFINS')} />
                    </TabsContent>
                    <TabsContent value="ipi" className="mt-4">
                        <Button onClick={() => handleDownloadConferencia(taxAndReconciliationAnalyses.taxConferences.ipi, 'IPI')} size="sm" className="mb-4" disabled={taxAndReconciliationAnalyses.taxConferences.ipi.length === 0}><Download className="mr-2 h-4 w-4" /> Baixar</Button>
                        <DataTable columns={getColumns(taxAndReconciliationAnalyses.taxConferences.ipi)} data={taxAndReconciliationAnalyses.taxConferences.ipi} footer={getTaxFooter(taxAndReconciliationAnalyses.taxConferences.ipi, 'Valor IPI')} />
                    </TabsContent>
                    <TabsContent value="icms_st" className="mt-4">
                        <Button onClick={() => handleDownloadConferencia(taxAndReconciliationAnalyses.taxConferences.icmsSt, 'ICMS_ST')} size="sm" className="mb-4" disabled={taxAndReconciliationAnalyses.taxConferences.icmsSt.length === 0}><Download className="mr-2 h-4 w-4" /> Baixar</Button>
                        <DataTable columns={getColumns(taxAndReconciliationAnalyses.taxConferences.icmsSt)} data={taxAndReconciliationAnalyses.taxConferences.icmsSt} footer={getTaxFooter(taxAndReconciliationAnalyses.taxConferences.icmsSt, 'Valor ICMS ST')} />
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    )
}