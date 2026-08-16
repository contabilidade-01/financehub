# Translation Key Comparison Analysis

## Keys Missing in EN-US (but present in PT-BR)

After systematically comparing both translation files, here are the keys that exist in `pt-br.json` but are missing from `en-us.json`:

### 1. common.deleting
- **PT-BR value**: "Excluindo..."
- **Suggested EN translation**: "Deleting..."

### 2. common.category
- **PT-BR value**: "Categoria"
- **Suggested EN translation**: "Category"

### 3. common.payment_method
- **PT-BR value**: "Forma de Pagamento"
- **Suggested EN translation**: "Payment Method"

### 4. transactions.payment_method.*
Missing entire payment_method object:
- **transactions.payment_method.label**: "Forma de Pagamento" → "Payment Method"
- **transactions.payment_method.placeholder**: "Selecione uma forma de pagamento" → "Select a payment method"
- **transactions.payment_method.empty**: "Nenhuma forma de pagamento disponível" → "No payment methods available"
- **transactions.payment_method.global_badge**: "Global" → "Global"

### 5. transactions.select_payment_method
- **PT-BR value**: "Selecione uma forma de pagamento"
- **Suggested EN translation**: "Select a payment method"

### 6. transactions.create_transaction
- **PT-BR value**: "Criar transação"
- **Suggested EN translation**: "Create transaction"

### 7. transactions.new_income
- **PT-BR value**: "Nova Receita"
- **Suggested EN translation**: "New Income"

### 8. transactions.new_expense
- **PT-BR value**: "Nova Despesa"
- **Suggested EN translation**: "New Expense"

### 9. transactions.fill_details_income
- **PT-BR value**: "Preencha os detalhes para registrar uma nova receita."
- **Suggested EN translation**: "Fill in the details to record a new income."

### 10. transactions.fill_details_expense
- **PT-BR value**: "Preencha os detalhes para registrar uma nova despesa."
- **Suggested EN translation**: "Fill in the details to record a new expense."

### 11. transactions.description
- **PT-BR value**: "Descrição"
- **Suggested EN translation**: "Description"

### 12. transactions.description_placeholder
- **PT-BR value**: "Descrição da transação"
- **Suggested EN translation**: "Transaction description"

### 13. transactions.amount
- **PT-BR value**: "Valor"
- **Suggested EN translation**: "Amount"

### 14. transactions.date
- **PT-BR value**: "Data"
- **Suggested EN translation**: "Date"

### 15. transactions.category
- **PT-BR value**: "Categoria"
- **Suggested EN translation**: "Category"

### 16. transactions.no_categories
- **PT-BR value**: "Nenhuma categoria disponível"
- **Suggested EN translation**: "No categories available"

### 17. transactions.no_payment_methods
- **PT-BR value**: "Nenhuma forma de pagamento disponível"
- **Suggested EN translation**: "No payment methods available"

### 18. transactions.no_wallet_available
- **PT-BR value**: "Nenhuma carteira disponível"
- **Suggested EN translation**: "No wallet available"

### 19. transactions.save_error
- **PT-BR value**: "Não foi possível salvar a transação."
- **Suggested EN translation**: "Could not save the transaction."

### 20. transactions.edit_description
- **PT-BR value**: "Edite os detalhes da transação abaixo."
- **Suggested EN translation**: "Edit the transaction details below."

### 21. transactions.fill_details
- **PT-BR value**: "Preencha os detalhes para registrar uma nova transação."
- **Suggested EN translation**: "Fill in the details to record a new transaction."

### 22. transactions.type
- **PT-BR value**: "Tipo"
- **Suggested EN translation**: "Type"

### 23. validation.invalid_category
- **PT-BR value**: "Categoria inválida."
- **Suggested EN translation**: "Invalid category."

### 24. validation.invalid_payment_method
- **PT-BR value**: "Forma de pagamento inválida."
- **Suggested EN translation**: "Invalid payment method."

### 25. validation.date_required
- **PT-BR value**: "A data é obrigatória."
- **Suggested EN translation**: "Date is required."

### 26. validation.type_required
- **PT-BR value**: "O tipo é obrigatório."
- **Suggested EN translation**: "Type is required."

### 27. categories.no_categories_available
- **PT-BR value**: "Nenhuma categoria disponível"
- **Suggested EN translation**: "No categories available"

### 28. categories.no_categories_found
- **PT-BR value**: "Nenhuma categoria encontrada"
- **Suggested EN translation**: "No categories found"

### 29. categories.names.*
Missing entire names object with translations for category names:
- "Alimentação" → "Food"
- "Transporte" → "Transportation"
- "Moradia" → "Housing"
- "Saúde" → "Health"
- "Educação" → "Education"
- "Lazer" → "Entertainment"
- "Vestuário" → "Clothing"
- "Impostos" → "Taxes"
- "Outros" → "Other"
- "Salário" → "Salary"
- "Freelance" → "Freelance"
- "Investimentos" → "Investments"
- "Doações" → "Donations"
- "Imposto" → "Tax"
- "Investimento" → "Investment"
- "Pets" → "Pets"
- "Viagem" → "Travel"

### 30. payment_methods.no_methods_available
- **PT-BR value**: "Nenhuma forma de pagamento disponível"
- **Suggested EN translation**: "No payment methods available"

### 31. settings.title
- **PT-BR value**: "Configurações"
- **Suggested EN translation**: "Settings"

### 32. settings.change_password
- **PT-BR value**: "Alterar Senha"
- **Suggested EN translation**: "Change Password"

### 33. language.form.code.hint
- **PT-BR value**: "Use formato ISO 639-1 (ex: pt-br, en-us)"
- **Suggested EN translation**: "Use ISO 639-1 format (e.g., pt-br, en-us)"

### 34. language.form.code.readonly
- **PT-BR value**: "O código do idioma não pode ser alterado"
- **Suggested EN translation**: "The language code cannot be changed"

### 35. language.delete.*
Missing delete object:
- **language.delete.success**: "Idioma removido com sucesso" → "Language deleted successfully"
- **language.delete.error**: "Erro ao remover idioma" → "Error deleting language"
- **language.delete.confirm**: "Tem certeza que deseja remover este idioma?" → "Are you sure you want to delete this language?"

## Summary

Total missing keys in EN-US: **35+ keys**

The most significant missing sections are:
1. **transactions.payment_method** - entire object missing
2. **categories.names** - entire object missing with 17 category name translations
3. **language.form** extensions (hint, readonly)
4. **language.delete** - entire object missing
5. Various individual transaction-related fields

These missing keys are likely causing the console log errors mentioned, as the application tries to access translation keys that don't exist in the English translation file.