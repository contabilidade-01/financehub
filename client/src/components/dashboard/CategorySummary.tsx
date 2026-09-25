import { motion } from "framer-motion";
import { CategoryIcon } from "@/components/shared/CategoryIcon";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation } from "wouter";
import { formatCurrency } from "@/lib/utils";
import { useTranslation } from "@/contexts/LocalizationContext";

interface CategorySummaryProps {
  isLoading: boolean;
  categories?: Array<{
    categoryId: number;
    name: string;
    total: number;
    color: string;
    icon: string;
    percentage: number;
  }>;
}

export default function CategorySummary({ isLoading, categories }: CategorySummaryProps) {
  const [, navigate] = useLocation();
  const { t } = useTranslation();
  
  const getIconComponent = (iconName: string) => {
    return <CategoryIcon icon={iconName} className="text-white" />;
  };
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
      className="h-full"
    >
      <Card className="border bg-card rounded-lg h-full">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl">{t('dashboard.categories.title', 'Categorias')}</h2>
            <div>
              <Button 
                variant="link" 
                className="text-primary text-sm hover:text-secondary transition-colors p-0"
                onClick={() => navigate("/categories")}
              >
                {t('dashboard.categories.view_all', 'Ver tudo')}
              </Button>
            </div>
          </div>
          
          <div className="space-y-5">
            {isLoading ? (
              Array(5).fill(0).map((_, index) => (
                <div key={index} className="flex items-center">
                  <Skeleton className="w-10 h-10 rounded-lg mr-4" />
                  <div className="flex-1">
                    <div className="flex justify-between items-center mb-1">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                    <Skeleton className="h-1.5 w-full rounded-full" />
                  </div>
                </div>
              ))
            ) : categories && categories.length > 0 ? (
              categories.map((category, index) => (
                <motion.div 
                  key={category.categoryId}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.1 }}
                  className="flex items-center"
                >
                  <div 
                    className="w-10 h-10 rounded-lg flex items-center justify-center mr-4"
                    style={{ backgroundColor: category.color || "#64748B" }}
                  >
                    {category.icon ? getIconComponent(category.icon) : <CategoryIcon className="text-white" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-center mb-1">
                      <h3 className="text-sm font-medium">{category.name}</h3>
                      <span className="text-sm font-numeric">{formatCurrency(category.total)}</span>
                    </div>
                    <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full transition-all duration-500"
                        style={{ 
                          width: `${category.percentage}%`,
                          backgroundColor: category.color || "#64748B"
                        }}
                      ></div>
                    </div>
                  </div>
                </motion.div>
              ))
            ) : (
              <div className="py-4 text-center text-muted-foreground">
                {t('dashboard.categories.no_categories', 'Nenhuma categoria encontrada')}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
