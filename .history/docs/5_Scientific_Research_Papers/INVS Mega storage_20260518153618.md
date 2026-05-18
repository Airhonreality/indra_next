## Error Type
Runtime Error

## Error Message
ENOENT: no such file or directory, rename 'C:\Users\javir\Documents\DEVs\agnostic system\storage\empresa-2\db\page_routes.json.tmp' -> 'C:\Users\javir\Documents\DEVs\agnostic system\storage\empresa-2\db\page_routes.json'


    at AppProvider.useCallback[saveItem] (src\context\AppContext.tsx:116:13)
    at async handleSaveRoute (src\components\agnostic\designer\AgnosticDesigner.tsx:150:5)

## Code Frame
  114 |         return result.record;
  115 |       }
> 116 |       throw new Error(result.error || 'Write operation failed');
      |             ^
  117 |     } catch (e: any) {
  118 |       if (!options?.silent) {
  119 |         toast.error(`Error guardando item en ${namespace}: ${e.message}`);

Next.js version: 15.5.15 (Webpack)
