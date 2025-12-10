
"use client";

import React, { useState, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Cpu, Download, Database } from 'lucide-react';
import { FileUploadForm } from './file-upload-form';
import { processCostCenterData } from '@/lib/excel-processor';
import type { ProcessedData } from '@/lib/excel-processor';
import * as XLSX from 'xlsx';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';


interface CostCenterAnalysisProps {
    costCenterFile: File | null;
    onCostCenterFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onClearCostCenterFile: () => void;
    processedData: ProcessedData | null;
}

export function CostCenterAnalysis({
    costCenterFile,
    onCostCenterFileChange,
    onClearCostCenterFile,
    processedData
}: CostCenterAnalysisProps) {
    const { toast } = useToast();

    const handleDownloadCostCenterDebug = () => {
        const costCenterKeys = processedData?.costCenterDebugKeys;
        if (!costCenterKeys || costCenterKeys.length === 0) {
            toast({ variant: 'destructive', title: "Nenhum dado de depuração para baixar" });
            return;
        }

        const workbook = XLSX.utils.book_new();
        const costCenterWorksheet = XLSX.utils.json_to_sheet(costCenterKeys);
        XLSX.utils.book_append_sheet(workbook, costCenterWorksheet, "Debug_Centro_Custo");

        const costCenterHeaders = processedData?.allCostCenters || [];
        if (costCenterHeaders.length > 0) {
            const headersWorksheet = XLSX.utils.json_to_sheet(costCenterHeaders.map(h => ({ "Centros de Custo Encontrados": h })));
            XLSX.utils.book_append_sheet(workbook, headersWorksheet, "Centros de Custo Encontrados");
        }

        XLSX.writeFile(workbook, "Grantel_Depuracao_Centro_Custo.xlsx");
        toast({ title: 'Planilha de Depuração Gerada' });
    };

    return (
        <div className="space-y-4">
            <div className='space-y-2'>
                <h3 className='font-medium'>Planilha de Rateio (Centro de Custo)</h3>
                <FileUploadForm
                    displayName="Centro de Custo"
                    formId="cost-center"
                    files={{ 'cost-center': !!costCenterFile }}
                    onFileChange={onCostCenterFileChange}
                    onClearFile={onClearCostCenterFile}
                />
            </div>
             <Button onClick={handleDownloadCostCenterDebug} variant="secondary" size="sm" className="w-full" disabled={!processedData?.costCenterDebugKeys || processedData.costCenterDebugKeys.length === 0}>
                <Download className="mr-2 h-4 w-4" /> Gerar Chaves de Depuração (Centro de Custo)
            </Button>
        </div>
    );
}
