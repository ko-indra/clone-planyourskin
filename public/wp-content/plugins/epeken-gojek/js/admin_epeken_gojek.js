
(function($){
	initiate_admin_gojek_script = function() {
		$('#epeken_gojek_kota_toko').on('change',function(){
			$.get(PT_Ajax_Admin_Gojek_Get_Province.ajaxurl, 
                                                                {   
                                                                        action: 'admin_gojek_get_province',
                                                                        nextNonce: PT_Ajax_Admin_Gojek_Get_Province.nextNonce,
                                                                        kota: this.value    
                                                                },  
                                                                function(data,status){
									var arr = data.split('0');
									var province = arr[0];
									$('#epeken_gojek_provinsi_toko').attr('value',province);
									$('#epeken_gojek_provinsi_toko_hd').attr('value',province);
                                                                /*$('#billing_address_2_co').empty();
                                                                        var arr = data.split(';');
                                                                           $('#billing_address_2_co').append('<option value="">Please Select Kecamatan</option>'); 
                                                                        $.each(arr, function (i,valu) {
                                                                         if (valu != '' && valu != '0') {     
                                                                           $('#billing_address_2_co').append('<option value="'+valu+'">'+valu+'</option>');    
                                                                         }   
                                                                        }); 
                                                                $('#billing_address_2_co').trigger('chosen:updated');
                                                                $('#panel_cek_ongkir_loading').attr('style','display: none;');*/
                                                		});
		});
	}
})(jQuery);
