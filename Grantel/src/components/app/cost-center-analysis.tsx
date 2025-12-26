
"use client";

import React from 'react';
import { FileUploadForm } from './file-upload-form';
import { Button } from '../ui/button';
import { Download } from 'lucide-react';
import { ProcessedData } from '@/lib/excel-processor';

interface CostCenterAnalysisProps {
    costCenterFile: File | null;
    onCostCenterFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onClearCostCenterFile: () => void;
    processedData: ProcessedData | null;
    onDownloadDebug: () => void;
}

export function CostCenterAnalysis({
    costCenterFile,
    onCostCenterFileChange,
    onClearCostCenterFile,
    processedData,
    onDownloadDebug,
}: CostCenterAnalysisProps) {
    
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
                 <Button onClick={onDownloadDebug} size="sm" variant="outline" disabled={!processedData?.costCenterDebugKeys || processedData.costCenterDebugKeys.length === 0}><Download className='h-4 w-4 mr-2' />Baixar Chaves de Depuração</Button>
            </div>
        </div>
    );
}
