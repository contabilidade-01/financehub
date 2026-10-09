import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, ChevronDown, Info, Plus, Bug, Settings, Wrench } from "lucide-react";

interface ChangelogData {
  currentVersion: string;
  versions: {
    version: string;
    date: string;
    title?: string;
    description?: string;
    features?: string[];
    improvements?: string[];
    fixes?: string[];
    changes?: Array<{
      type: 'feat' | 'fix' | 'core' | 'patch';
      description: string;
    } | string>;
  }[];
}

const getChangeIcon = (type: string) => {
  switch (type) {
    case 'feat':
    case 'features':
      return <Plus className="h-3 w-3 text-income" />;
    case 'fix':
    case 'fixes':
      return <Bug className="h-3 w-3 text-expense" />;
    case 'core':
      return <Settings className="h-3 w-3 text-blue-500" />;
    case 'patch':
      return <Wrench className="h-3 w-3 text-orange-500" />;
    case 'improvements':
      return <Settings className="h-3 w-3 text-purple-500" />;
    default:
      return <span className="text-primary mt-1.5 block w-1 h-1 rounded-full bg-current flex-shrink-0" />;
  }
};

const getChangeBadge = (type: string) => {
  switch (type) {
    case 'feat':
    case 'features':
      return <Badge variant="outline" className="text-xs px-2 py-0.5 bg-green-50 text-income border-green-200 rounded-[4px] h-5 font-medium">FEATURES</Badge>;
    case 'fix':
    case 'fixes':
      return <Badge variant="outline" className="text-xs px-2 py-0.5 bg-red-50 text-expense border-red-200 rounded-[4px] h-5 font-medium">FIXES</Badge>;
    case 'core':
      return <Badge variant="outline" className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 border-blue-200 rounded-[4px] h-5 font-medium">CORE</Badge>;
    case 'patch':
      return <Badge variant="outline" className="text-xs px-2 py-0.5 bg-orange-50 text-orange-700 border-orange-200 rounded-[4px] h-5 font-medium">PATCH</Badge>;
    case 'improvements':
      return <Badge variant="outline" className="text-xs px-2 py-0.5 bg-purple-50 text-purple-700 border-purple-200 rounded-[4px] h-5 font-medium">IMPROVEMENTS</Badge>;
    default:
      return null;
  }
};

export function VersionDisplay() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { data: changelog, isLoading } = useQuery<ChangelogData>({
    queryKey: ["/api/changelog"],
    staleTime: 1000 * 60 * 30, // 30 minutes
  });

  const currentVersion = changelog?.currentVersion || "0.0.0";

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 h-auto"
        onClick={() => setIsModalOpen(true)}
      >
        Build: v.{currentVersion}
      </Button>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader className="sticky top-0 bg-background z-10 pb-4 border-b">
            <DialogTitle className="flex items-center gap-2">
              <Info className="h-5 w-5" />
              Histórico de Versões
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto space-y-6 pt-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-sm text-muted-foreground">Carregando histórico...</div>
              </div>
            ) : changelog?.versions?.length ? (
              changelog.versions.map((version, index) => (
                <div key={version.version} className="border-b pb-4 last:border-b-0">
                <div className="flex items-center gap-3 mb-3">
                  <Badge variant={index === 0 ? "default" : "secondary"} className="text-base px-3 py-1">
                    v.{version.version}
                  </Badge>
                  {index === 0 && (
                    <Badge variant="outline" className="text-base px-3 py-1">
                      Atual
                    </Badge>
                  )}
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    {new Date(version.date).toLocaleDateString('pt-BR')}
                  </div>
                </div>
                
                {/* Título e descrição da versão (novo formato) */}
                {version.title && (
                  <div className="mb-4">
                    <h3 className="font-semibold text-lg text-foreground mb-2">{version.title}</h3>
                    {version.description && (
                      <p className="text-sm text-muted-foreground leading-relaxed">{version.description}</p>
                    )}
                  </div>
                )}

                <div className="space-y-4">
                  {/* Renderizar novo formato (features, improvements, fixes) */}
                  {version.features && version.features.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 mb-3">
                        {getChangeIcon('features')}
                        {getChangeBadge('features')}
                        <h4 className="font-medium text-sm">Novas Funcionalidades</h4>
                      </div>
                      <ul className="space-y-2 ml-6">
                        {version.features.map((feature, featureIndex) => (
                          <li key={featureIndex} className="text-sm text-muted-foreground flex items-start gap-2">
                            <span className="text-income mt-1.5 block w-1.5 h-1.5 rounded-full bg-current flex-shrink-0" />
                            <span className="flex-1">{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {version.improvements && version.improvements.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 mb-3">
                        {getChangeIcon('improvements')}
                        {getChangeBadge('improvements')}
                        <h4 className="font-medium text-sm">Melhorias</h4>
                      </div>
                      <ul className="space-y-2 ml-6">
                        {version.improvements.map((improvement, improvementIndex) => (
                          <li key={improvementIndex} className="text-sm text-muted-foreground flex items-start gap-2">
                            <span className="text-purple-500 mt-1.5 block w-1.5 h-1.5 rounded-full bg-current flex-shrink-0" />
                            <span className="flex-1">{improvement}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {version.fixes && version.fixes.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 mb-3">
                        {getChangeIcon('fixes')}
                        {getChangeBadge('fixes')}
                        <h4 className="font-medium text-sm">Correções</h4>
                      </div>
                      <ul className="space-y-2 ml-6">
                        {version.fixes.map((fix, fixIndex) => (
                          <li key={fixIndex} className="text-sm text-muted-foreground flex items-start gap-2">
                            <span className="text-expense mt-1.5 block w-1.5 h-1.5 rounded-full bg-current flex-shrink-0" />
                            <span className="flex-1">{fix}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Renderizar formato antigo (changes array) */}
                  {version.changes && version.changes.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="font-medium text-sm">Alterações:</h4>
                      <ul className="space-y-2">
                        {version.changes.map((change, changeIndex) => {
                          // Handle both new object format and legacy string format
                          const isObject = typeof change === 'object' && change !== null;
                          const changeType = isObject ? (change as any).type : 'default';
                          const changeDescription = isObject ? (change as any).description : change as string;
                          
                          return (
                            <li key={changeIndex} className="text-sm text-muted-foreground flex items-start gap-2">
                              {getChangeIcon(changeType)}
                              {getChangeBadge(changeType)}
                              <span className="flex-1">{changeDescription}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
              ))
            ) : (
              <div className="flex items-center justify-center py-8">
                <div className="text-sm text-muted-foreground">Nenhum histórico disponível</div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}