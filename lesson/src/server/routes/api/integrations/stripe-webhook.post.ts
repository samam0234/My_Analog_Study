import { api } from '../../../lib/http';
import { acceptStripeWebhook } from '../../../lib/integrations';
export default api(acceptStripeWebhook);
