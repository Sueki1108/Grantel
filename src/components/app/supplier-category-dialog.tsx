"use client";

import React, { useState, useEffect } from 'react';
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlusCircle, Trash2, Settings2 } from "lucide-react";
import type { SupplierCategory } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '../ui/scroll-area';

interface SupplierCategoryDialogProps {
  categories: SupplierCategory[];
  onSave: (newCategories: SupplierCategory[]) => void;
}

export function SupplierCategoryDialog({ categories, onSave }: SupplierCategoryDialogProps) {
  const [localCategories, setLocalCategories] = useState<SupplierCategory[]>(categories);
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen) {
      setLocalCategories(categories);
    }
  }, [isOpen, categories]);

  const handleAddNew = () => {
    setLocalCategories([
      ...localCategories,
      { id: `new-${Date.now()}`, name: 'Nova Categoria', icon: 'Box', blockedCfops: [] }
    ]);
  };

  const handleRemove = (idToRemove: string) => {
    setLocalCategories(localCategories.filter(c => c.id !== idToRemove));
  };

  const handleUpdate = <K extends keyof SupplierCategory>(idToUpdate: string, field: K, value: SupplierCategory[K]) => {
    setLocalCategories(
      localCategories.map(c =>
        c.id === idToUpdate ? { ...c, [field]: value } : c
      )
    );
  };
  
  const handleBlockedCfopsChange = (idToUpdate: string, cfopString: string) => {
    const cfops = cfopString.split(',').map(s => s.trim()).filter(Boolean);
    handleUpdate(idToUpdate, 'blockedCfops', cfops);
  };

  const handleSave = () => {
    const validCategories = localCategories.filter(c => c.name.trim() !== '');
    onSave(validCategories);
    setIsOpen(false);
    toast({ title: 'Categorias de fornecedores guardadas!' });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings2 className="mr-2 h-4 w-4" />
          Gerir Categorias
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Gerir Categorias de Fornecedores</DialogTitle>
          <DialogDescription>
            Adicione, edite ou remova categorias para classificar os seus fornecedores. Defina os CFOPs a serem bloqueados para cada categoria.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className='h-96 pr-4'>
        <div className="space-y-4 py-4">
          {localCategories.map((category) => (
            <div key={category.id} className="grid grid-cols-4 items-center gap-4 border-b pb-4 last:border-b-0">
                <div className='col-span-4 space-y-2'>
                     <Label>Nome & Ícone (Lucide)</Label>
                     <div className='flex gap-2'>
                        <Input
                            value={category.name}
                            onChange={(e) => handleUpdate(category.id, 'name', e.target.value)}
                            placeholder="Nome da Categoria"
                        />
                         <Input
                            value={category.icon}
                            onChange={(e) => handleUpdate(category.id, 'icon', e.target.value)}
                            placeholder="Ex: Wrench"
                            className='w-28'
                        />
                     </div>
                </div>
                 <div className='col-span-3'>
                    <Label>CFOPs Bloqueados (separados por vírgula)</Label>
                    <Input
                        value={category.blockedCfops.join(', ')}
                        onChange={(e) => handleBlockedCfopsChange(category.id, e.target.value)}
                        placeholder="Ex: 1128, 2128"
                    />
                </div>
                <div className='flex items-end h-full'>
                    <Button
                    variant="destructive"
                    size="icon"
                    onClick={() => handleRemove(category.id)}
                    className="self-end"
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
            </div>
          ))}
          <Button variant="outline" onClick={handleAddNew} className="w-full">
            <PlusCircle className="mr-2 h-4 w-4" /> Adicionar Nova Categoria
          </Button>
        </div>
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>Cancelar</Button>
          <Button onClick={handleSave}>Guardar Alterações</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
