"use client"

import type { ChangeEvent } from "react";
import { Upload, File, X, FileCheck, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";

export type FileList = Record<string, boolean>;

interface FileUploadFormProps {
    files: FileList;
    onFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
    onClearFile: (fileName: string, category?: string) => void;
    requiredFiles?: string[];
    xmlFileCount?: number;
    fileCount?: number;
    displayName?: string;
    formId?: string;
    multiple?: boolean;
}

export function FileUploadForm({
    requiredFiles = [],
    files,
    onFileChange,
    onClearFile,
    xmlFileCount = 0,
    fileCount = 0,
    displayName,
    formId,
    multiple = false,
}: FileUploadFormProps) {
    const getFileAcceptType = (fileName: string) => {
        if (fileName.startsWith('xml') || (displayName && displayName.toLowerCase().includes('xml'))) {
            return '.xml,.zip';
        }
        if (fileName.toLowerCase().includes('txt')) {
            return '.txt';
        }
        return ".xlsx, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel";
    }

    const getBaseName = (fileName: string) => {
        if (displayName) return displayName;
        if (fileName.startsWith('xml')) return "XMLs NFe/CTe";
        return `${fileName}.xlsx`;
    }
    
    // Single uploader mode (when displayName is provided)
    if (displayName && formId) {
        const hasFile = files[formId];
        const addMoreId = `${formId}-add-more`;
        const currentFileCount = xmlFileCount > 0 ? xmlFileCount : fileCount;

        return (
            <div className="relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-secondary/50 p-4 transition-all min-h-[160px]">
                {hasFile && (
                     <div className="absolute right-1 top-1 flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                            <label htmlFor={addMoreId} className="cursor-pointer">
                                <FileUp className="h-4 w-4" />
                            </label>
                        </Button>
                         <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onClearFile(formId, formId.replace('xml-',''))}>
                            <X className="h-4 w-4" />
                        </Button>
                        <input id={addMoreId} name={addMoreId} type="file" accept={getFileAcceptType(formId)} className="sr-only" onChange={onFileChange} multiple={multiple || formId.includes('xml')} />
                    </div>
                )}
                {hasFile ? (
                    <div className="flex flex-col items-center gap-2 text-center">
                        <FileCheck className="h-10 w-10 text-primary" />
                        <p className="font-semibold">{displayName}</p>
                        <p className="text-xs text-muted-foreground">
                            {currentFileCount > 0 ? `${currentFileCount} arquivo(s) carregado(s)` : 'Arquivo carregado'}
                        </p>
                    </div>
                ) : (
                    <>
                        <label htmlFor={formId} className="flex h-full w-full cursor-pointer flex-col items-center justify-center text-center">
                            <Upload className="h-10 w-10 text-muted-foreground" />
                            <p className="mt-2 font-semibold">{displayName}</p>
                            <p className="text-sm text-muted-foreground">Carregue ficheiros ou uma pasta .zip</p>
                        </label>
                        <input
                            id={formId}
                            name={formId}
                            type="file"
                            accept={getFileAcceptType(formId)}
                            className="sr-only"
                            onChange={onFileChange}
                            multiple={multiple || formId.includes('xml')}
                        />
                    </>
                )}
            </div>
        )
    }

    // Grid mode for multiple required files
    return (
        <>
            {requiredFiles.map((name) => {
                 const addMoreId = `${name}-add-more`;
                 const hasFile = files[name];
                 return (
                    <div key={name} className="relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-secondary/50 p-4 transition-all min-h-[160px]">
                        {hasFile && (
                            <div className="absolute right-1 top-1 flex items-center gap-1">
                                <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                                    <label htmlFor={addMoreId} className="cursor-pointer">
                                        <FileUp className="h-4 w-4" />
                                    </label>
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onClearFile(name)}>
                                    <X className="h-4 w-4" />
                                </Button>
                                <input id={addMoreId} name={addMoreId} type="file" accept={getFileAcceptType(name)} className="sr-only" onChange={onFileChange} multiple={name.startsWith('xml')} />
                            </div>
                        )}
                        {hasFile ? (
                            <div className="flex flex-col items-center gap-2 text-center">
                                <FileCheck className="h-10 w-10 text-primary" />
                                <p className="font-semibold">{getBaseName(name)}</p>
                                <p className="text-xs text-muted-foreground">
                                    {name.startsWith('xml') && xmlFileCount > 0 ? `${xmlFileCount} arquivo(s) carregado(s)` : 'Arquivo carregado'}
                                </p>
                            </div>
                        ) : (
                             <>
                                <label htmlFor={name} className="flex h-full w-full cursor-pointer flex-col items-center justify-center text-center">
                                    <Upload className="h-10 w-10 text-muted-foreground" />
                                    <p className="mt-2 font-semibold">{getBaseName(name)}</p>
                                    <p className="text-sm text-muted-foreground">
                                        {name.startsWith('xml') ? 'Carregue ficheiros ou uma pasta .zip' : 'Clique para carregar'}
                                    </p>
                                </label>
                                <input
                                    id={name}
                                    name={name}
                                    type="file"
                                    accept={getFileAcceptType(name)}
                                    className="sr-only"
                                    onChange={onFileChange}
                                    multiple={name.startsWith('xml')}
                                />
                            </>
                        )}
                    </div>
                );
            })}
        </>
    );
}
