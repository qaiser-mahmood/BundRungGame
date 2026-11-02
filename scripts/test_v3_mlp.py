import unittest
import numpy as np
from v3_train_mlp import init, loss_grad, forward

class GradientTests(unittest.TestCase):
    def test_backprop_matches_finite_differences(self):
        rng=np.random.default_rng(7)
        params=init([3,4,3,2],rng)
        x=np.asarray([[.2,.3,.9],[.7,.4,.1]],dtype=np.float32)
        mask=np.asarray([[1,1],[1,0]],dtype=np.float32)
        target=np.asarray([[0,1],[1,0]],dtype=np.float32)
        _,grads=loss_grad(params,x,mask,target)
        for i in range(len(params)):
            for index in list(np.ndindex(params[i].shape))[:6]:
                old=params[i][index].copy();eps=.002
                params[i][index]=old+eps;plus,_=loss_grad(params,x,mask,target)
                params[i][index]=old-eps;minus,_=loss_grad(params,x,mask,target)
                params[i][index]=old
                self.assertAlmostEqual(float(grads[i][index]),(plus-minus)/(2*eps),delta=.0002)
        p,_=forward(params,x,mask)
        self.assertEqual(p[1,1],0)

    def test_masked_fit_reduces_loss_and_seed_is_reproducible(self):
        params=init([3,4,2],np.random.default_rng(3))
        again=init([3,4,2],np.random.default_rng(3))
        for a,b in zip(params,again): np.testing.assert_array_equal(a,b)
        x=np.eye(3,dtype=np.float32);mask=np.ones((3,2),dtype=np.float32)
        target=np.asarray([[1,0],[0,1],[1,0]],dtype=np.float32)
        initial,_=loss_grad(params,x,mask,target)
        for _ in range(100):
            _,grad=loss_grad(params,x,mask,target)
            params=[p-.1*g for p,g in zip(params,grad)]
        final,_=loss_grad(params,x,mask,target)
        self.assertLess(final,initial*.5)

    def test_dropout_gradient_with_fixed_random_masks(self):
        params=init([3,4,2],np.random.default_rng(7))
        x=np.asarray([[.2,.3,.9],[.7,.4,.1]],dtype=np.float32)
        mask=np.ones((2,2),dtype=np.float32)
        target=np.asarray([[0,1],[1,0]],dtype=np.float32)
        _,grads=loss_grad(params,x,mask,target,.2,np.random.default_rng(11))
        for i in range(len(params)):
            for index in list(np.ndindex(params[i].shape))[:6]:
                old=params[i][index].copy();eps=.002
                params[i][index]=old+eps;plus,_=loss_grad(params,x,mask,target,.2,np.random.default_rng(11))
                params[i][index]=old-eps;minus,_=loss_grad(params,x,mask,target,.2,np.random.default_rng(11))
                params[i][index]=old
                self.assertAlmostEqual(float(grads[i][index]),(plus-minus)/(2*eps),delta=.0002)

if __name__=='__main__': unittest.main()
