
"use client";

import React, { useEffect } from 'react';
import { FileUploadForm } from './file-upload-form';
import { useToast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';

interface CostCenterAnalysisProps {
    costCenterFile: File | null;
    onCostCenterFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onClearCostCenterFile: () => void;
}

export function CostCenterAnalysis({
    costCenterFile,
    onCostCenterFileChange,
    onClearCostCenterFile,
}: CostCenterAnalysisProps) {
    const { toast } = useToast();

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onCostCenterFileChange(e);
    };

    return (
        <div className="space-y-4">
            <div className='space-y-2'>
                <h3 className='font-medium'>Planilha de Rateio (Centro de Custo)</h3>
                <FileUploadForm
                    displayName="Centro de Custo"
                    formId="cost-center"
                    files={{ 'cost-center': !!costCenterFile }}
                    onFileChange={handleFileChange}
                    onClearFile={onClearCostCenterFile}
                />
            </div>
        </div>
    );
}



