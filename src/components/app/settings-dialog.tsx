"use client";

import { useState, useEffect } from 'react';
import { Settings, Monitor, Wide } from 'lucide-react';
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface SettingsDialogProps {
    initialWideMode: boolean;
    onSettingsChange: (settings: { wideMode: boolean }) => void;
}

export function SettingsDialog({ initialWideMode, onSettingsChange }: SettingsDialogProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [wideMode, setWideMode] = useState(initialWideMode);

    useEffect(() => {
        setWideMode(initialWideMode);
    }, [initialWideMode]);

    const handleSaveChanges = () => {
        onSettingsChange({ wideMode });
        setIsOpen(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="icon" title="Configurações de Exibição">
                    <Settings className="h-5 w-5" />
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2"><Settings /> Configurações de Exibição</DialogTitle>
                    <DialogDescription>
                        Ajuste a aparência da interface para se adequar melhor ao seu ecrã.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-6">
                    <div className="flex items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                            <Label htmlFor="wide-mode-switch" className="text-base flex items-center gap-2">
                                <Monitor className="h-5 w-5" />
                                Modo Amplo
                            </Label>
                            <p className="text-sm text-muted-foreground">
                                Aumenta a largura do conteúdo para preencher ecrãs grandes.
                            </p>
                        </div>
                        <Switch
                            id="wide-mode-switch"
                            checked={wideMode}
                            onCheckedChange={setWideMode}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsOpen(false)}>Cancelar</Button>
                    <Button onClick={handleSaveChanges}>Guardar Alterações</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

    