
"use client";

import React from 'react';
import { FileUploadForm } from './file-upload-form';

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
        </div>
    );
}
